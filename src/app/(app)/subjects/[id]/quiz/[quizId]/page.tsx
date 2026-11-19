"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RotateCcw,
  Target,
  XCircle,
} from "lucide-react";

import { LevelBadge } from "@/components/mastery";
import { SourceChips, SourcePathsContext } from "@/components/sources";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getJson, postJson } from "@/lib/api";
import { fetchDocuments } from "@/lib/data";
import { levelFor } from "@/lib/mastery";
import type { AnswerResult, PublicQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

type Result = AnswerResult & { userAnswer?: string };

interface QuizPayload {
  quiz: { id: string; subjectId: string; mode: string; focusTopics: string[]; completedAt: string | null };
  questions: PublicQuestion[];
  results: Record<string, Result>;
}

const TYPE_LABEL: Record<PublicQuestion["type"], string> = {
  multiple_choice: "Multiple choice",
  true_false: "True or false",
  fill_blank: "Fill in the blank",
  short_answer: "Short answer",
  application: "Apply it",
};
const DIFFICULTY = ["", "Easy", "Medium", "Hard"];

export default function QuizPlayerPage() {
  const { id, quizId } = useParams<{ id: string; quizId: string }>();
  const router = useRouter();
  const [payload, setPayload] = useState<QuizPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paths, setPaths] = useState<Record<string, string | null>>({});
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    getJson<QuizPayload>(`/api/quiz/${quizId}`)
      .then((p) => {
        setPayload(p);
        const first = p.questions.findIndex((q) => !p.results[q.id]);
        setIndex(first === -1 ? 0 : first);
        if (first === -1) setReviewing(true);
      })
      .catch((e) => setLoadError(e.message));
    fetchDocuments(id)
      .then((docs) => setPaths(Object.fromEntries(docs.map((d) => [d.id, d.storage_path]))))
      .catch(() => {});
  }, [id, quizId]);

  if (loadError) {
    return (
      <div className="text-center">
        <p className="text-destructive">{loadError}</p>
        <Link href={`/subjects/${id}/quiz`} className="mt-3 inline-block text-sm underline underline-offset-4">
          Back to quizzes
        </Link>
      </div>
    );
  }
  if (!payload) return <Skeleton className="mx-auto h-80 max-w-2xl rounded-xl" />;

  const { questions, results } = payload;
  const answeredCount = Object.keys(results).length;
  const allAnswered = answeredCount === questions.length;

  return (
    <SourcePathsContext.Provider value={paths}>
      <div className="mx-auto max-w-2xl">
        {reviewing && allAnswered ? (
          <Summary
            payload={payload}
            subjectId={id}
            onReview={(i) => {
              setIndex(i);
              setReviewing(false);
            }}
            onRetry={async () => {
              const res = await postJson<{ quizId: string }>("/api/quiz", {
                subjectId: id,
                mode: "retry",
                retryQuizId: quizId,
              });
              router.push(`/subjects/${id}/quiz/${res.quizId}`);
            }}
          />
        ) : (
          <QuestionCard
            key={questions[index].id}
            question={questions[index]}
            number={index + 1}
            total={questions.length}
            answeredCount={answeredCount}
            result={results[questions[index].id]}
            onAnswered={(r) =>
              setPayload((p) => (p ? { ...p, results: { ...p.results, [r.questionId]: r } } : p))
            }
            onPrev={index > 0 ? () => setIndex(index - 1) : undefined}
            onNext={() => {
              if (allAnswered) return setIndex(Math.min(index + 1, questions.length - 1));
              const after = questions.findIndex((q, i) => i > index && !results[q.id]);
              setIndex(after !== -1 ? after : questions.findIndex((q) => !results[q.id]));
            }}
            allAnswered={allAnswered}
            hasNext={index < questions.length - 1}
            onFinish={() => setReviewing(true)}
          />
        )}
      </div>
    </SourcePathsContext.Provider>
  );
}

function QuestionCard({
  question,
  number,
  total,
  answeredCount,
  result,
  onAnswered,
  onPrev,
  onNext,
  allAnswered,
  hasNext,
  onFinish,
}: {
  question: PublicQuestion;
  number: number;
  total: number;
  answeredCount: number;
  result?: Result;
  onAnswered: (r: Result) => void;
  onPrev?: () => void;
  onNext: () => void;
  allAnswered: boolean;
  hasNext: boolean;
  onFinish: () => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChoice = question.type === "multiple_choice" || question.type === "true_false";
  const canSubmit = isChoice ? choice !== null : text.trim().length > 0;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<AnswerResult>("/api/quiz/answer", {
        questionId: question.id,
        answer: isChoice ? choice : text,
      });
      onAnswered({ ...r, userAnswer: isChoice ? question.options[choice!] : text });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check your answer.");
    } finally {
      setBusy(false);
    }
  }

  const progress = Math.round((answeredCount / total) * 100);

  return (
    <div className="animate-in-up">
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Question {number} of {total}
          </span>
          <span className="tabular-nums">{answeredCount} answered</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <Card className="gap-5 px-5 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">{TYPE_LABEL[question.type]}</span>
          <span>{question.topic}</span>
          <span>·</span>
          <span>{DIFFICULTY[question.difficulty]}</span>
        </div>
        <p className="text-lg leading-relaxed font-medium">{question.prompt}</p>

        <form onSubmit={submit} className="grid gap-3">
          {isChoice ? (
            <div role="radiogroup" aria-label="Answer options" className="grid gap-2">
              {question.options.map((opt, i) => {
                const picked = result ? result.userAnswer === opt : choice === i;
                const correct = result && result.correctAnswer === opt;
                return (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    disabled={!!result || busy}
                    onClick={() => setChoice(i)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                      !result && "hover:border-foreground/30 hover:bg-muted/40",
                      !result && picked && "border-primary bg-primary/5 ring-1 ring-primary",
                      result && correct && "border-success bg-success/8",
                      result && picked && !correct && "border-destructive bg-destructive/8",
                      result && !picked && !correct && "opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium",
                        picked && !result && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="flex-1">{opt}</span>
                    {result && correct && <CheckCircle2 className="size-4 text-success" />}
                    {result && picked && !correct && <XCircle className="size-4 text-destructive" />}
                  </button>
                );
              })}
            </div>
          ) : question.type === "fill_blank" ? (
            <Input
              value={result ? (result.userAnswer ?? "") : text}
              onChange={(e) => setText(e.target.value)}
              disabled={!!result || busy}
              placeholder="Type the missing word or number"
              className="h-11 text-base"
              autoFocus
            />
          ) : (
            <Textarea
              value={result ? (result.userAnswer ?? "") : text}
              onChange={(e) => setText(e.target.value)}
              disabled={!!result || busy}
              placeholder={question.type === "application" ? "Explain your reasoning…" : "Answer in 1–3 sentences…"}
              rows={4}
              className="text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
            />
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {!result && (
            <div className="flex items-center justify-between gap-2 pt-1">
              {onPrev ? (
                <Button type="button" variant="ghost" onClick={onPrev}>
                  <ArrowLeft /> Back
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" disabled={!canSubmit || busy} className="h-9 px-4">
                {busy && <Loader2 className="animate-spin" />}
                {busy && !isChoice ? "Checking…" : "Check answer"}
              </Button>
            </div>
          )}
        </form>

        {result && <Feedback result={result} type={question.type} />}

        {result && (
          <div className="flex items-center justify-between gap-2">
            {onPrev ? (
              <Button variant="ghost" onClick={onPrev}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {allAnswered && hasNext && (
                <Button variant="outline" onClick={onNext} className="h-9 px-4">
                  Next <ArrowRight />
                </Button>
              )}
              {allAnswered ? (
                <Button onClick={onFinish} className="h-9 px-4" autoFocus>
                  See results <ArrowRight />
                </Button>
              ) : (
                <Button onClick={onNext} className="h-9 px-4" autoFocus>
                  Next question <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Feedback({ result, type }: { result: Result; type: PublicQuestion["type"] }) {
  const styles = {
    correct: { icon: CheckCircle2, color: "text-success", bg: "bg-success/8 border-success/30", label: "Correct" },
    partially_correct: {
      icon: CircleDashed,
      color: "text-warning",
      bg: "bg-warning/8 border-warning/40",
      label: "Partly correct",
    },
    incorrect: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/6 border-destructive/30", label: "Not quite" },
  }[result.verdict];
  const Icon = styles.icon;
  const showCorrect = result.verdict !== "correct" || type === "short_answer" || type === "application";

  return (
    <div className={cn("animate-in-up grid gap-3 rounded-lg border px-4 py-4", styles.bg)} aria-live="polite">
      <p className={cn("flex items-center gap-2 font-medium", styles.color)}>
        <Icon className="size-4" /> {styles.label}
      </p>
      {result.feedback && <p className="text-sm leading-relaxed">{result.feedback}</p>}
      {showCorrect && (
        <p className="text-sm leading-relaxed">
          <span className="font-medium">{type === "short_answer" || type === "application" ? "Model answer: " : "Correct answer: "}</span>
          {result.correctAnswer}
        </p>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Why: </span>
        {result.explanation}
      </p>
      <SourceChips sources={result.sources} />
    </div>
  );
}

function Summary({
  payload,
  subjectId,
  onReview,
  onRetry,
}: {
  payload: QuizPayload;
  subjectId: string;
  onReview: (index: number) => void;
  onRetry: () => Promise<void>;
}) {
  const { questions, results } = payload;
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = questions.length;
  const score = questions.reduce((s, q) => s + (results[q.id]?.score ?? 0), 0);
  const correct = questions.filter((q) => results[q.id]?.score === 1).length;
  const partial = questions.filter((q) => results[q.id]?.score === 0.5).length;
  const wrong = total - correct - partial;
  const pct = Math.round((score / total) * 100);

  const topics = useMemo(() => {
    const map = new Map<string, { score: number; n: number }>();
    for (const q of questions) {
      const t = map.get(q.topic) ?? { score: 0, n: 0 };
      t.score += results[q.id]?.score ?? 0;
      t.n++;
      map.set(q.topic, t);
    }
    return [...map.entries()]
      .map(([topic, { score, n }]) => ({ topic, percent: Math.round((score / n) * 100), n }))
      .sort((a, b) => a.percent - b.percent);
  }, [questions, results]);
  const understood = topics.filter((t) => t.percent >= 85);
  const revise = topics.filter((t) => t.percent < 85);

  return (
    <div className="animate-in-up grid gap-4">
      <Card className="items-center px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">Quiz complete</p>
        <p className="text-5xl font-semibold tracking-tight tabular-nums">{pct}%</p>
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-success" /> {correct} correct
          </span>
          {partial > 0 && (
            <span className="flex items-center gap-1.5">
              <CircleDashed className="size-4 text-warning" /> {partial} partly
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <XCircle className="size-4 text-destructive" /> {wrong} incorrect
          </span>
        </div>
        <p className="max-w-sm text-xs text-muted-foreground">
          This is a learning indicator to guide your revision, not a prediction of your exam score.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {wrong + partial > 0 && (
            <Button
              onClick={async () => {
                setRetrying(true);
                setError(null);
                try {
                  await onRetry();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not start the retry.");
                  setRetrying(false);
                }
              }}
              disabled={retrying}
            >
              {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />} Retry incorrect questions
            </Button>
          )}
          <Link href={`/subjects/${subjectId}/quiz`} className={cn(buttonVariants({ variant: "outline" }))}>
            <Target /> New quiz
          </Link>
          <Link href={`/subjects/${subjectId}/progress`} className={cn(buttonVariants({ variant: "ghost" }))}>
            View progress
          </Link>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="px-5">
          <p className="font-medium">Topics you understand</p>
          {understood.length ? (
            <ul className="grid gap-2">
              {understood.map((t) => (
                <li key={t.topic} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{t.topic}</span>
                  <span className="tabular-nums text-success">{t.percent}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None fully yet — keep going.</p>
          )}
        </Card>
        <Card className="px-5">
          <p className="font-medium">Topics to revise</p>
          {revise.length ? (
            <ul className="grid gap-2">
              {revise.map((t) => (
                <li key={t.topic} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{t.topic}</span>
                  <LevelBadge level={levelFor(t.percent)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing — great work.</p>
          )}
          {revise.length > 0 && (
            <Link
              href={`/subjects/${subjectId}/notes`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}
            >
              <BookOpen /> Review notes
            </Link>
          )}
        </Card>
      </div>

      <Card className="gap-0 py-1">
        <p className="px-5 pt-3 pb-2 text-sm font-medium">Review answers</p>
        {questions.map((q, i) => {
          const r = results[q.id];
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onReview(i)}
              className="flex items-start gap-3 border-t px-5 py-3 text-left hover:bg-muted/50"
            >
              {r?.score === 1 ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              ) : r?.score === 0.5 ? (
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              )}
              <span className="min-w-0 flex-1 text-sm">
                <span className="line-clamp-2">{q.prompt}</span>
                <span className="text-xs text-muted-foreground">{q.topic}</span>
              </span>
            </button>
          );
        })}
      </Card>
    </div>
  );
}
