"use client";

import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowser } from "@/lib/supabase/client";

export interface Subject {
  id: string;
  name: string;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  subject_id: string;
  name: string;
  page_count: number;
  status: "processing" | "ready" | "partial" | "failed";
  failed_pages: number[];
  ocr_pages: number[];
  error: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface QuizSummary {
  id: string;
  subject_id: string;
  mode: "standard" | "weak_topics" | "retry";
  question_count: number;
  created_at: string;
  completed_at: string | null;
  answered: number;
  score: number; // sum of scores
  subjectName?: string;
}

export interface AnswerRecord {
  quiz_id: string;
  subject_id: string;
  topic: string;
  score: number;
  difficulty: number;
  created_at: string;
}

/** Minimal data-loading hook: returns data, error, loading and a reload function. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await run());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load data.");
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

function must<T>(res: { data: unknown; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Could not load ${what}.`);
  return res.data as T;
}

export async function fetchSubjects() {
  const sb = getSupabaseBrowser();
  return must<Subject[]>(
    await sb.from("subjects").select("id, name, created_at").order("created_at"),
    "subjects",
  );
}

export async function fetchSubject(id: string) {
  const sb = getSupabaseBrowser();
  const subject = must<Subject | null>(
    await sb.from("subjects").select("id, name, created_at").eq("id", id).maybeSingle(),
    "subject",
  );
  if (!subject) throw new Error("This subject does not exist or was deleted.");
  return subject;
}

export async function fetchDocuments(subjectId?: string) {
  const sb = getSupabaseBrowser();
  let q = sb
    .from("documents")
    .select("id, subject_id, name, page_count, status, failed_pages, ocr_pages, error, storage_path, created_at")
    .order("created_at", { ascending: false });
  if (subjectId) q = q.eq("subject_id", subjectId);
  return must<DocumentRow[]>(await q, "documents");
}

export async function fetchAnswers(subjectId?: string) {
  const sb = getSupabaseBrowser();
  let q = sb
    .from("quiz_answers")
    .select("quiz_id, subject_id, topic, score, difficulty, created_at")
    .order("created_at", { ascending: false })
    .limit(3000);
  if (subjectId) q = q.eq("subject_id", subjectId);
  const rows = must<AnswerRecord[]>(await q, "quiz answers");
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export async function fetchQuizzes(subjectId?: string, limit = 20): Promise<QuizSummary[]> {
  const sb = getSupabaseBrowser();
  let q = sb
    .from("quizzes")
    .select("id, subject_id, mode, question_count, created_at, completed_at, subjects(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (subjectId) q = q.eq("subject_id", subjectId);
  const quizzes = must<
    (Omit<QuizSummary, "answered" | "score"> & { subjects: { name: string } | null })[]
  >(await q, "quizzes");
  if (!quizzes.length) return [];
  const answers = must<{ quiz_id: string; score: number }[]>(
    await sb.from("quiz_answers").select("quiz_id, score").in("quiz_id", quizzes.map((x) => x.id)),
    "quiz results",
  );
  return quizzes.map(({ subjects, ...quiz }) => {
    const mine = answers.filter((a) => a.quiz_id === quiz.id);
    return {
      ...quiz,
      subjectName: subjects?.name,
      answered: mine.length,
      score: mine.reduce((s, a) => s + Number(a.score), 0),
    };
  });
}
