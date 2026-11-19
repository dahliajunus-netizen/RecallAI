import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeMastery, type AnswerRow } from "@/lib/mastery";
import type { PublicQuestion } from "@/lib/types";

export async function subjectMastery(supabase: SupabaseClient, subjectId: string) {
  const { data } = await supabase
    .from("quiz_answers")
    .select("topic, score, difficulty, created_at")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(2000);
  return computeMastery((data ?? []) as AnswerRow[]);
}

export async function previousQuestionPrompts(supabase: SupabaseClient, subjectId: string) {
  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!quizzes?.length) return [];
  const { data } = await supabase
    .from("quiz_questions")
    .select("prompt")
    .in("quiz_id", quizzes.map((q) => q.id))
    .is("retry_of", null)
    .limit(200);
  return (data ?? []).map((q) => q.prompt as string);
}

export function toPublic(q: {
  id: string;
  position: number;
  type: PublicQuestion["type"];
  topic: string;
  difficulty: number;
  prompt: string;
  options: string[];
}): PublicQuestion {
  return {
    id: q.id,
    position: q.position,
    type: q.type,
    topic: q.topic,
    difficulty: q.difficulty as 1 | 2 | 3,
    prompt: q.prompt,
    options: q.options,
  };
}
