import { gradeOpenAnswer } from "@/lib/ai/quiz";
import { gradeBlank, gradeChoice } from "@/lib/grading";
import { authed, HttpError, readJson } from "@/lib/server/route";
import type { AnswerResult, SourceRef } from "@/lib/types";

export const maxDuration = 120;

interface AnswerKey {
  correctOptionIndex: number;
  correctAnswer: string;
  acceptableAnswers: string[];
}

export const POST = authed(async ({ req, supabase }) => {
  const body = await readJson<{ questionId?: string; answer?: string | number }>(req);
  if (!body.questionId) throw new HttpError("Missing question.");

  const { data: q } = await supabase
    .from("quiz_questions")
    .select("id, quiz_id, type, topic, difficulty, prompt, options, answer, explanation, sources, quizzes(subject_id)")
    .eq("id", body.questionId)
    .maybeSingle();
  if (!q) throw new HttpError("Question not found.", 404);

  const key = q.answer as AnswerKey;
  const sources = q.sources as SourceRef[];
  const options = q.options as string[];
  const correctAnswer =
    key.correctOptionIndex >= 0 ? options[key.correctOptionIndex] ?? key.correctAnswer : key.correctAnswer;

  // Already answered: return the saved result instead of grading twice.
  const { data: existing } = await supabase
    .from("quiz_answers")
    .select("score, feedback")
    .eq("question_id", q.id)
    .maybeSingle();
  if (existing) return toResult(q.id, Number(existing.score), existing.feedback ?? "", q.explanation, correctAnswer, sources);

  let score: 0 | 0.5 | 1;
  let feedback = "";
  let userAnswer: string;

  if (q.type === "multiple_choice" || q.type === "true_false") {
    const idx = Number(body.answer);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) throw new HttpError("Choose an answer.");
    userAnswer = options[idx];
    score = gradeChoice(idx, key.correctOptionIndex);
  } else {
    userAnswer = String(body.answer ?? "").trim().slice(0, 2000);
    if (!userAnswer) throw new HttpError("Type an answer first.");
    if (q.type === "fill_blank") {
      const g = gradeBlank(userAnswer, [key.correctAnswer, ...key.acceptableAnswers]);
      score = g === "wrong" ? 0 : 1;
      if (g === "typo") feedback = `Accepted, but check the spelling: "${key.correctAnswer}".`;
    } else {
      const sourceText = await loadSourceText(supabase, sources);
      const graded = await gradeOpenAnswer({
        question: q.prompt,
        modelAnswer: key.correctAnswer,
        explanation: q.explanation,
        studentAnswer: userAnswer,
        sourceText,
      });
      score = graded.verdict === "correct" ? 1 : graded.verdict === "partially_correct" ? 0.5 : 0;
      feedback = graded.feedback;
    }
  }

  const subjectId = (q.quizzes as unknown as { subject_id: string }).subject_id;
  const { error } = await supabase.from("quiz_answers").insert({
    quiz_id: q.quiz_id,
    question_id: q.id,
    subject_id: subjectId,
    topic: q.topic,
    difficulty: q.difficulty,
    user_answer: userAnswer,
    score,
    feedback,
  });
  if (error && error.code !== "23505") throw new HttpError("Your answer could not be saved.", 500);

  // Mark the quiz complete once every question has an answer.
  const [{ count: total }, { count: answered }] = await Promise.all([
    supabase.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", q.quiz_id),
    supabase.from("quiz_answers").select("id", { count: "exact", head: true }).eq("quiz_id", q.quiz_id),
  ]);
  if (total && answered && answered >= total) {
    await supabase.from("quizzes").update({ completed_at: new Date().toISOString() }).eq("id", q.quiz_id);
  }

  return toResult(q.id, score, feedback, q.explanation, correctAnswer, sources);
});

function toResult(
  questionId: string,
  score: number,
  feedback: string,
  explanation: string,
  correctAnswer: string,
  sources: SourceRef[],
): AnswerResult {
  const s = (score >= 1 ? 1 : score > 0 ? 0.5 : 0) as 0 | 0.5 | 1;
  return {
    questionId,
    score: s,
    verdict: s === 1 ? "correct" : s === 0.5 ? "partially_correct" : "incorrect",
    feedback,
    explanation,
    correctAnswer,
    sources,
  };
}

async function loadSourceText(
  supabase: Parameters<Parameters<typeof authed>[0]>[0]["supabase"],
  sources: SourceRef[],
) {
  const parts: string[] = [];
  for (const s of sources.slice(0, 3)) {
    const { data } = await supabase
      .from("document_pages")
      .select("text")
      .eq("document_id", s.documentId)
      .eq("page_number", s.page)
      .maybeSingle();
    if (data?.text) parts.push(`[${s.documentName}, page ${s.page}]\n${data.text.slice(0, 6000)}`);
  }
  return parts.join("\n\n") || "(source page text unavailable)";
}
