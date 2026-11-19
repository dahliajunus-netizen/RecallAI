import { NextResponse } from "next/server";

import { toPublic } from "@/lib/server/quiz";
import { getUser } from "@/lib/supabase/server";
import type { AnswerResult, PublicQuestion, SourceRef } from "@/lib/types";

/** Returns a quiz's questions (without answer keys) plus results for questions already answered. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, subject_id, mode, focus_topics, created_at, completed_at, subjects(name)")
    .eq("id", id)
    .maybeSingle();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });

  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase
      .from("quiz_questions")
      .select("id, position, type, topic, difficulty, prompt, options, answer, explanation, sources")
      .eq("quiz_id", id)
      .order("position"),
    supabase.from("quiz_answers").select("question_id, score, feedback, user_answer").eq("quiz_id", id),
  ]);

  const answerMap = new Map((answers ?? []).map((a) => [a.question_id as string, a]));
  const results: Record<string, AnswerResult & { userAnswer: string }> = {};
  const publicQuestions: PublicQuestion[] = [];
  for (const q of questions ?? []) {
    publicQuestions.push(toPublic(q));
    const a = answerMap.get(q.id);
    if (!a) continue;
    const key = q.answer as { correctOptionIndex: number; correctAnswer: string };
    const score = Number(a.score) as 0 | 0.5 | 1;
    results[q.id] = {
      questionId: q.id,
      score,
      verdict: score === 1 ? "correct" : score === 0.5 ? "partially_correct" : "incorrect",
      feedback: a.feedback ?? "",
      explanation: q.explanation,
      correctAnswer: key.correctOptionIndex >= 0 ? q.options[key.correctOptionIndex] : key.correctAnswer,
      sources: q.sources as SourceRef[],
      userAnswer: a.user_answer,
    };
  }

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      subjectId: quiz.subject_id,
      subjectName: (quiz.subjects as unknown as { name: string } | null)?.name ?? "",
      mode: quiz.mode,
      focusTopics: quiz.focus_topics,
      createdAt: quiz.created_at,
      completedAt: quiz.completed_at,
    },
    questions: publicQuestions,
    results,
  });
}
