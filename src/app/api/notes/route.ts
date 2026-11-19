import { generateStudyGuide } from "@/lib/ai/notes";
import { assertSubject, loadSubjectContext } from "@/lib/server/context";
import { authed, HttpError, readJson } from "@/lib/server/route";

export const maxDuration = 300;

export const POST = authed(async ({ req, supabase }) => {
  const body = await readJson<{ subjectId?: string; documentIds?: string[] }>(req);
  await assertSubject(supabase, body.subjectId);
  const { ctx, docs } = await loadSubjectContext(supabase, body.subjectId!, body.documentIds);

  const guide = await generateStudyGuide(ctx);

  const { data, error } = await supabase
    .from("study_guides")
    .insert({ subject_id: body.subjectId, document_ids: docs.map((d) => d.id), content: guide })
    .select("id, created_at")
    .single();
  if (error) throw new HttpError("Notes were generated but could not be saved. Please try again.", 500);
  return { id: data.id, created_at: data.created_at, content: guide };
});
