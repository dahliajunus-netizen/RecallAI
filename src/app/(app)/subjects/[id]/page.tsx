"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  ScanText,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDocuments, useLoad, type DocumentRow } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { deleteDocument, openOriginal, uploadPdf, validatePdf } from "@/lib/upload";
import { cn } from "@/lib/utils";

interface UploadItem {
  key: string;
  name: string;
  stage: "queued" | "uploading" | "reading" | "ocr" | "saving" | "done" | "error";
  progress: number;
  message?: string;
}

const STAGE_LABEL: Record<UploadItem["stage"], string> = {
  queued: "Waiting…",
  uploading: "Uploading…",
  reading: "Reading pages",
  ocr: "Scanning images of pages (OCR)",
  saving: "Saving text",
  done: "Done",
  error: "Failed",
};

export default function MaterialsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: docs, loading, reload } = useLoad(() => fetchDocuments(id), [id]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<UploadItem>) =>
    setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      const items: { item: UploadItem; file: File }[] = list.map((file) => {
        const problem = validatePdf(file);
        return {
          file,
          item: {
            key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            stage: problem ? "error" : "queued",
            progress: 0,
            message: problem ?? undefined,
          },
        };
      });
      setUploads((u) => [...items.map((i) => i.item), ...u]);

      // Process one at a time: keeps the browser responsive on large PDFs.
      for (const { item, file } of items) {
        if (item.stage === "error") continue;
        try {
          const result = await uploadPdf(id, file, (stage, progress) => update(item.key, { stage, progress }));
          const msg =
            result.status === "failed"
              ? "No readable text found on any page."
              : result.failedPages.length
                ? `${result.failedPages.length} of ${result.pageCount} pages could not be read (pages ${result.failedPages.join(", ")}).`
                : `${result.pageCount} pages read${result.ocrPages.length ? `, ${result.ocrPages.length} via OCR` : ""}.`;
          update(item.key, {
            stage: result.status === "failed" ? "error" : "done",
            progress: 100,
            message: msg,
          });
        } catch (err) {
          update(item.key, { stage: "error", message: err instanceof Error ? err.message : "Upload failed." });
        }
        reload();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  async function remove(doc: DocumentRow) {
    try {
      await deleteDocument(doc.id, doc.storage_path);
      toast.success(`Removed “${doc.name}”.`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the document.");
    }
  }

  async function view(doc: DocumentRow) {
    if (!doc.storage_path) return;
    try {
      window.open(await openOriginal(doc.storage_path), "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the PDF.");
    }
  }

  const busy = uploads.some((u) => !["done", "error"].includes(u.stage));
  const readyCount = docs?.filter((d) => d.status === "ready" || d.status === "partial").length ?? 0;

  return (
    <div className="grid gap-8">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "grid place-items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30",
        )}
      >
        <span className="grid size-11 place-items-center rounded-full bg-background shadow-sm ring-1 ring-foreground/10">
          <UploadCloud className="size-5 text-primary" />
        </span>
        <p className="mt-4 font-medium">Drag and drop your PDFs here</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Text-based or scanned PDFs, in English or Bahasa Indonesia. Up to 50 MB each. You can add several
          documents for the same subject.
        </p>
        <Button className="mt-5" variant="outline" onClick={() => inputRef.current?.click()}>
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* In-progress uploads */}
      {uploads.length > 0 && (
        <section aria-live="polite">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Uploads</h2>
            {!busy && (
              <Button variant="ghost" size="sm" onClick={() => setUploads([])}>
                Clear
              </Button>
            )}
          </div>
          <Card className="mt-3 gap-0 py-1">
            {uploads.map((u) => (
              <div key={u.key} className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
                <span className="mt-0.5">
                  {u.stage === "done" ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : u.stage === "error" ? (
                    <AlertTriangle className="size-4 text-destructive" />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className={cn("text-xs", u.stage === "error" ? "text-destructive" : "text-muted-foreground")}>
                    {u.message ??
                      `${STAGE_LABEL[u.stage]}${["reading", "ocr", "saving"].includes(u.stage) ? ` · ${u.progress}%` : ""}`}
                  </p>
                  {!["done", "error", "queued"].includes(u.stage) && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-[width]" style={{ width: `${u.progress}%` }} />
                    </div>
                  )}
                </div>
                {["done", "error"].includes(u.stage) && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Dismiss"
                    onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Documents */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Study materials</h2>
          {readyCount > 0 && (
            <div className="flex gap-2">
              <Link href={`/subjects/${id}/notes`} className={cn(buttonVariants({ size: "sm" }))}>
                Generate notes <ArrowRight />
              </Link>
            </div>
          )}
        </div>
        {loading ? (
          <Skeleton className="mt-3 h-20 rounded-xl" />
        ) : !docs?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">No PDFs yet. Upload your first chapter above.</p>
        ) : (
          <Card className="mt-3 gap-0 py-1">
            {docs.map((d) => (
              <div key={d.id} className="flex items-start gap-3 border-b px-4 py-3 last:border-0">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.page_count} pages · added {timeAgo(d.created_at)}
                  </p>
                  <DocStatus doc={d} />
                </div>
                <div className="flex shrink-0 gap-1">
                  {d.storage_path && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Open ${d.name}`} onClick={() => view(d)}>
                      <ExternalLink />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${d.name}`}
                    onClick={() => remove(d)}
                    disabled={d.status === "processing" && busy}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function DocStatus({ doc }: { doc: DocumentRow }) {
  if (doc.status === "processing") {
    return <p className="mt-1 text-xs text-muted-foreground">Processing… (if this stays, remove and upload again)</p>;
  }
  if (doc.status === "failed") {
    return <p className="mt-1 text-xs text-destructive">{doc.error ?? "This PDF could not be read."}</p>;
  }
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {doc.status === "partial" ? (
        <span className="inline-flex items-center gap-1 text-[color-mix(in_oklch,var(--warning),black_30%)] dark:text-warning">
          <AlertTriangle className="size-3" />
          Pages {doc.failed_pages.join(", ")} could not be read and are not used in notes or quizzes
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="size-3" /> All pages read
        </span>
      )}
      {doc.ocr_pages.length > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <ScanText className="size-3" /> {doc.ocr_pages.length} scanned page{doc.ocr_pages.length === 1 ? "" : "s"} read with OCR
        </span>
      )}
    </div>
  );
}
