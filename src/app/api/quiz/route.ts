import { generateQuiz } from "@/lib/ai/quiz";
import { assertSubject, latestGuide, loadSubjectContext } from "@/lib/server/context";
import { previousQuestionPrompts, subjectMastery } from "@/lib/server/quiz";
import { authed, HttpError, readJson } from "@/lib/server/route";

export const maxDuration = 300;

type Mode = "standard" | "weak_topics" | "retry";

export const POST = authed(async ({ req, supabase }) => {
  const body = await readJson<{ subjectId?: string; mode?: Mode; count?: number; retryQuizId?: string }>(req);
  const subject = await assertSubject(supabase, body.subjectId);
  const mode: Mode = body.mode ?? "standard";

  if (mode === "retry") return createRetryQuiz(supabase, subject.id, body.retryQuizId);

  const count = Math.min(15, Math.max(5, Math.round(body.count ?? (mode === "weak_topics" ? 8 : 10))));
  const guide = await latestGuide(supabase, subject.id);
  const { ctx } = await loadSubjectContext(supabase, subject.id, guide?.document_ids);
  const topics = guide?.content.topics.map((t) => t.name) ?? [];

  let focus: Awaited<ReturnType<typeof subjectMastery>> = [];
  if (mode === "weak_topics") {
    const mastery = await subjectMastery(supabase, subject.id);
    if (!mastery.length) {
      throw new HttpError("Take a quiz first so RecallAI can find the topics you need to practise.");
    }
    focus = mastery.filter((m) => m.level !== "strong").slice(0, 4);
    // Everything is strong: practise the weakest ones at the hardest level.
    if (!focus.length) focus = mastery.slice(0, 3);
  }

  const previousQuestions = await previousQuestionPrompts(supabase, subject.id);
  const questions = await generateQuiz({
    ctx,
    topics: topics.length ? topics : ["(choose 4-8 short topic names from the material)"],
    count,
    focus,
    previousQuestions,
  });
  if (questions.length < 3) {
    throw new HttpError("The AI could not write enough reliable questions from this material. Please try again.", 502);
  }

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      subject_id: subject.id,
      mode,
      focus_topics: focus.map((f) => f.topic),
      question_count: questions.length,
    })
    .select("id")
    .single();
  if (error) throw new HttpError("Could not save the quiz.", 500);

  const { error: qErr } = await supabase.from("quiz_questions").insert(
    questions.map((q, i) => ({
      quiz_id: quiz.id,
      position: i,
      type: q.type,
      topic: q.topic,
      difficulty: q.difficulty,
      prompt: q.prompt,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      sources: q.sources,
    })),
  );
  if (qErr) {
    await supabase.from("quizzes").delete().eq("id", quiz.id);
    throw new HttpError("Could not save the quiz questions.", 500);
  }
  return { quizId: quiz.id };
});

async function createRetryQuiz(
  supabase: Parameters<Parameters<typeof authed>[0]>[0]["supabase"],
  subjectId: string,
  retryQuizId?: string,
) {
  if (!retryQuizId) throw new HttpError("Missing quiz to retry.");
  const { data: wrong } = await supabase
    .from("quiz_answers")
    .select("question_id")
    .eq("quiz_id", retryQuizId)
    .lt("score", 1);
  if (!wrong?.length) throw new HttpError("There are no incorrect answers to retry in this quiz.");

  const { data: originals } = await supabase
    .from("quiz_questions")
    .select("*")
    .in("id", wrong.map((w) => w.question_id))
    .order("position");
  if (!originals?.length) throw new HttpError("Could not load the questions to retry.", 500);

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      subject_id: subjectId,
      mode: "retry",
      focus_topics: [...new Set(originals.map((o) => o.topic as string))],
      question_count: originals.length,
    })
    .select("id")
    .single();
  if (error) throw new HttpError("Could not create the retry quiz.", 500);

  const { error: qErr } = await supabase.from("quiz_questions").insert(
    originals.map((o, i) => ({
      quiz_id: quiz.id,
      position: i,
      type: o.type,
      topic: o.topic,
      difficulty: o.difficulty,
      prompt: o.prompt,
      options: o.options,
      answer: o.answer,
      explanation: o.explanation,
      sources: o.sources,
      retry_of: o.retry_of ?? o.id,
    })),
  );
  if (qErr) {
    await supabase.from("quizzes").delete().eq("id", quiz.id);
    throw new HttpError("Could not create the retry quiz.", 500);
  }
  return { quizId: quiz.id };
}
