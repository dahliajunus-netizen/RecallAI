"use client";

import { createContext, useContext } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import type { SourceRef } from "@/lib/types";
import { openOriginal } from "@/lib/upload";
import { cn } from "@/lib/utils";

/** Maps documentId -> storage path so a source chip can open the original PDF at the cited page. */
export const SourcePathsContext = createContext<Record<string, string | null>>({});

function shortName(name: string) {
  const base = name.replace(/\.pdf$/i, "");
  return base.length > 22 ? `${base.slice(0, 20)}…` : base;
}

export function SourceChips({ sources, className }: { sources: SourceRef[]; className?: string }) {
  const paths = useContext(SourcePathsContext);
  if (!sources.length) {
    return (
      <span className={cn("text-[11px] text-muted-foreground italic", className)}>
        No verified page reference
      </span>
    );
  }

  async function open(s: SourceRef) {
    const path = paths[s.documentId];
    if (!path) {
      toast.message(`${s.documentName}, page ${s.page}`, { description: `“${s.quote}”` });
      return;
    }
    try {
      const url = await openOriginal(path);
      window.open(`${url}#page=${s.page}`, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the PDF.");
    }
  }

  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {sources.map((s) => (
        <button
          key={`${s.documentId}:${s.page}`}
          type="button"
          onClick={() => open(s)}
          title={`${s.match === "unverified" ? "Quote not found word-for-word on this page. " : ""}“${s.quote}”`}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
            s.match === "unverified" && "border-dashed",
          )}
        >
          <FileText className="size-3" />
          {shortName(s.documentName)} · p.{s.page}
          {s.match === "unverified" && <span className="text-warning">?</span>}
        </button>
      ))}
    </span>
  );
}
