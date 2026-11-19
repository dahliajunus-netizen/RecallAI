import { explainTopic } from "@/lib/ai/quiz";
import { assertSubject, loadSubjectContext } from "@/lib/server/context";
import { authed, HttpError, readJson } from "@/lib/server/route";

export const maxDuration = 120;

export const POST = authed(async ({ req, supabase }) => {
  const body = await readJson<{ subjectId?: string; topic?: string }>(req);
  await assertSubject(supabase, body.subjectId);
  if (!body.topic || typeof body.topic !== "string") throw new HttpError("Missing topic.");

  const { data: wrong } = await supabase
    .from("quiz_answers")
    .select("question_id, quiz_questions(prompt)")
    .eq("subject_id", body.subjectId!)
    .eq("topic", body.topic)
    .lt("score", 1)
    .order("created_at", { ascending: false })
    .limit(8);
  const mistakes = (wrong ?? [])
    .map((w) => (w.quiz_questions as unknown as { prompt: string } | null)?.prompt)
    .filter((p): p is string => !!p);

  const { ctx } = await loadSubjectContext(supabase, body.subjectId!);
  return explainTopic(ctx, body.topic, mistakes);
});
