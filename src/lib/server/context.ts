import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildDocContext, MAX_CONTEXT_CHARS, type PageRow } from "@/lib/ai/sources";
import type { StudyGuide } from "@/lib/types";
import { HttpError } from "./route";

/** Loads the readable text of a subject's documents (optionally a subset) as model context. */
export async function loadSubjectContext(
  supabase: SupabaseClient,
  subjectId: string,
  documentIds?: string[],
) {
  let q = supabase
    .from("documents")
    .select("id, name, status")
    .eq("subject_id", subjectId)
    .in("status", ["ready", "partial"])
    .order("created_at");
  if (documentIds?.length) q = q.in("id", documentIds);
  const { data: docs, error } = await q;
  if (error) throw new HttpError("Could not load your documents.", 500);
  if (!docs?.length) {
    throw new HttpError("Upload at least one readable PDF to this subject first.", 400);
  }

  const pages: PageRow[] = [];
  // Page through results: Supabase caps a single select at 1000 rows by default.
  for (let from = 0; ; from += 1000) {
    const { data, error: pErr } = await supabase
      .from("document_pages")
      .select("document_id, page_number, text, method")
      .in("document_id", docs.map((d) => d.id))
      .order("page_number")
      .range(from, from + 999);
    if (pErr) throw new HttpError("Could not load document pages.", 500);
    pages.push(...((data ?? []) as PageRow[]));
    if (!data || data.length < 1000) break;
  }

  const ctx = buildDocContext(docs, pages);
  if (ctx.pagesUsed === 0) {
    throw new HttpError("None of the selected pages could be read, so there is nothing to study from.", 400);
  }
  if (ctx.chars > MAX_CONTEXT_CHARS) {
    throw new HttpError(
      `The selected material is too long to analyse at once (${Math.round(ctx.chars / 1000)}k characters). Select fewer documents and generate notes for them separately.`,
      413,
    );
  }
  return { ctx, docs };
}

export async function latestGuide(supabase: SupabaseClient, subjectId: string) {
  const { data } = await supabase
    .from("study_guides")
    .select("id, content, document_ids, created_at")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; content: StudyGuide; document_ids: string[]; created_at: string } | null;
}

export async function assertSubject(supabase: SupabaseClient, subjectId: unknown) {
  if (typeof subjectId !== "string") throw new HttpError("Missing subject.");
  const { data } = await supabase.from("subjects").select("id, name").eq("id", subjectId).maybeSingle();
  if (!data) throw new HttpError("Subject not found.", 404);
  return data as { id: string; name: string };
}
