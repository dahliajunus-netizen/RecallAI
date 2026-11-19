"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ListChecks, RefreshCw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { NotesView } from "@/components/notes-view";
import { SourcePathsContext } from "@/components/sources";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Working } from "@/components/working";
import { postJson } from "@/lib/api";
import { fetchDocuments, useLoad } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { StudyGuide } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GuideRow {
  id: string;
  content: StudyGuide;
  document_ids: string[];
  created_at: string;
}

export default function NotesPage() {
  const { id } = useParams<{ id: string }>();
  const topic = useSearchParams().get("topic");
  const { data, loading, setData } = useLoad(async () => {
    const sb = getSupabaseBrowser();
    const [docs, guideRes] = await Promise.all([
      fetchDocuments(id),
      sb
        .from("study_guides")
        .select("id, content, document_ids, created_at")
        .eq("subject_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (guideRes.error) throw new Error("Could not load notes.");
    return { docs, guide: guideRes.data as GuideRow | null };
  }, [id]);

  const readyDocs = useMemo(
    () => data?.docs.filter((d) => d.status === "ready" || d.status === "partial") ?? [],
    [data],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setSelected(readyDocs.map((d) => d.id));
  }, [readyDocs]);

  const paths = useMemo(
    () => Object.fromEntries((data?.docs ?? []).map((d) => [d.id, d.storage_path])),
    [data],
  );

  const guide = data?.guide;
  const newDocsSinceGuide = guide ? readyDocs.filter((d) => !guide.document_ids.includes(d.id)) : [];

  async function generate() {
    if (!selected.length) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await postJson<GuideRow>("/api/notes", { subjectId: id, documentIds: selected });
      setData((d) => (d ? { ...d, guide: { ...res, document_ids: selected } } : d));
      setShowPicker(false);
      toast.success("Your revision notes are ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate notes.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!readyDocs.length && !guide) {
    return (
      <div className="grid place-items-center rounded-xl bg-card px-6 py-14 text-center ring-1 ring-foreground/10">
        <p className="font-medium">No readable PDFs yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Upload a chapter first. RecallAI will turn it into structured revision notes.
        </p>
        <Link href={`/subjects/${id}`} className={cn(buttonVariants(), "mt-5")}>
          <Upload /> Upload PDFs
        </Link>
      </div>
    );
  }

  if (generating) {
    return (
      <Working
        title="Creating your revision guide"
        hint="usually 1–3 minutes for a chapter"
        steps={[
          "Reading every page of your material…",
          "Finding the definitions, key ideas and processes that matter most…",
          "Writing simple explanations and spotting commonly confused terms…",
          "Checking every note against its source page…",
          "Almost there — longer documents take a little more time…",
        ]}
      />
    );
  }

  const picker = (
    <div className="rounded-xl bg-card px-4 py-5 ring-1 ring-foreground/10 sm:px-5">
      <p className="font-medium">{guide ? "Regenerate notes" : "Generate revision notes"}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose which PDFs to include. Notes use only what is written in these documents.
      </p>
      <ul className="mt-4 grid gap-2">
        {readyDocs.map((d) => (
          <li key={d.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/50">
              <Checkbox
                checked={selected.includes(d.id)}
                onCheckedChange={(c) =>
                  setSelected((s) => (c ? [...s, d.id] : s.filter((x) => x !== d.id)))
                }
              />
              <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
              <span className="text-xs text-muted-foreground">{d.page_count} p.</span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={generate} disabled={!selected.length}>
          <Sparkles /> {guide ? "Regenerate" : "Generate notes"}
        </Button>
        {guide && (
          <Button variant="ghost" onClick={() => setShowPicker(false)}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );

  if (!guide) return picker;

  return (
    <SourcePathsContext.Provider value={paths}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Generated {timeAgo(guide.created_at)} from {guide.document_ids.length} PDF
            {guide.document_ids.length === 1 ? "" : "s"} · {guide.content.meta.pagesUsed} pages
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1.5">
              Labels: <span className="rounded bg-muted px-1 uppercase">From PDF</span>
              <span className="rounded bg-primary/10 px-1 text-primary uppercase">AI explanation</span>
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPicker((s) => !s)}>
              <RefreshCw /> Regenerate
            </Button>
            <Link href={`/subjects/${id}/quiz`} className={cn(buttonVariants({ size: "sm" }))}>
              <ListChecks /> Test yourself
            </Link>
          </div>
        </div>

        {newDocsSinceGuide.length > 0 && !showPicker && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/5 px-4 py-3 text-sm">
            <span>
              {newDocsSinceGuide.length} new PDF{newDocsSinceGuide.length === 1 ? " was" : "s were"} added since these
              notes were made.
            </span>
            <Button size="sm" variant="outline" onClick={() => setShowPicker(true)}>
              Update notes
            </Button>
          </div>
        )}

        {showPicker && picker}
        <NotesView guide={guide.content} initialTopic={topic} />
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Notes are generated by AI from your PDFs and checked against the cited pages. A dashed reference marked “?”
          could not be matched word-for-word — double-check it in the PDF.
        </p>
      </div>
    </SourcePathsContext.Provider>
  );
}
