"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, ListChecks, RotateCcw, Target, Upload } from "lucide-react";

import { LevelBadge } from "@/components/mastery";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Working } from "@/components/working";
import { postJson } from "@/lib/api";
import { fetchAnswers, fetchDocuments, fetchQuizzes, useLoad } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { computeMastery } from "@/lib/mastery";
import { cn } from "@/lib/utils";

const MODE_LABEL = { standard: "Quiz", weak_topics: "Weak-topic practice", retry: "Retry incorrect" } as const;

export default function QuizHomePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading } = useLoad(async () => {
    const [docs, quizzes, answers] = await Promise.all([fetchDocuments(id), fetchQuizzes(id, 30), fetchAnswers(id)]);
    return { docs, quizzes, answers };
  }, [id]);
  const [count, setCount] = useState(10);
  const [starting, setStarting] = useState<null | "standard" | "weak_topics" | "retry">(null);
  const [error, setError] = useState<string | null>(null);

  const mastery = useMemo(() => computeMastery(data?.answers ?? []), [data]);
  const focus = mastery.filter((m) => m.level !== "strong").slice(0, 4);
  const hasReadable = data?.docs.some((d) => d.status === "ready" || d.status === "partial");

  async function start(mode: "standard" | "weak_topics" | "retry", retryQuizId?: string) {
    setStarting(mode);
    setError(null);
    try {
      const res = await postJson<{ quizId: string }>("/api/quiz", {
        subjectId: id,
        mode,
        count: mode === "standard" ? count : undefined,
        retryQuizId,
      });
      router.push(`/subjects/${id}/quiz/${res.quizId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the quiz.");
      setStarting(null);
    }
  }

  if (loading) return <Skeleton className="h-48 rounded-xl" />;

  if (!hasReadable) {
    return (
      <div className="grid place-items-center rounded-xl bg-card px-6 py-14 text-center ring-1 ring-foreground/10">
        <p className="font-medium">Upload material to start a quiz</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">Questions are written only from your PDFs.</p>
        <Link href={`/subjects/${id}`} className={cn(buttonVariants(), "mt-5")}>
          <Upload /> Upload PDFs
        </Link>
      </div>
    );
  }

  if (starting && starting !== "retry") {
    return (
      <Working
        title={starting === "weak_topics" ? "Building your practice set" : "Writing your quiz"}
        hint="usually 1–2 minutes"
        steps={[
          "Picking questions from different sections of your material…",
          "Mixing question types and difficulty levels…",
          "Checking each answer against its source page…",
        ]}
      />
    );
  }

  return (
    <div className="grid gap-8">
      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <ListChecks className="size-4" />
            </span>
            <div>
              <p className="font-medium">New quiz</p>
              <p className="text-xs text-muted-foreground">Mixed question types across all topics</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Number of questions</p>
            <div className="mt-1.5 inline-flex rounded-lg border p-0.5">
              {[5, 10, 15].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm tabular-nums transition-colors",
                    count === n ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => start("standard")} disabled={!!starting} className="self-start">
            Start quiz
          </Button>
        </Card>

        <Card className="px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-muted">
              <Target className="size-4" />
            </span>
            <div>
              <p className="font-medium">Practise weak topics</p>
              <p className="text-xs text-muted-foreground">Adapts difficulty to how well you know each topic</p>
            </div>
          </div>
          {mastery.length ? (
            <ul className="grid gap-1.5">
              {(focus.length ? focus : mastery.slice(0, 3)).map((m) => (
                <li key={m.topic} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{m.topic}</span>
                  <LevelBadge level={m.level} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Finish a quiz first so RecallAI knows what to focus on.</p>
          )}
          <Button
            variant="outline"
            onClick={() => start("weak_topics")}
            disabled={!!starting || !mastery.length}
            className="self-start"
          >
            {focus.length ? "Practise these topics" : "Challenge mode"}
          </Button>
        </Card>
      </div>

      <section>
        <h2 className="font-semibold">Quiz history</h2>
        {!data?.quizzes.length ? (
          <p className="mt-3 text-sm text-muted-foreground">No quizzes yet.</p>
        ) : (
          <Card className="mt-3 gap-0 py-1">
            {data.quizzes.map((q) => {
              const wrong = q.answered - q.score;
              const pct = q.answered ? Math.round((q.score / q.answered) * 100) : 0;
              return (
                <div key={q.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                  <Link href={`/subjects/${id}/quiz/${q.id}`} className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{MODE_LABEL[q.mode]}</p>
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(q.created_at)} ·{" "}
                      {q.completed_at ? `${pct}% · ${q.question_count} questions` : `${q.answered}/${q.question_count} answered`}
                    </p>
                  </Link>
                  {q.completed_at && wrong > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => start("retry", q.id)} disabled={!!starting}>
                      <RotateCcw /> Retry mistakes
                    </Button>
                  )}
                  <Link
                    href={`/subjects/${id}/quiz/${q.id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
                    aria-label={q.completed_at ? "Review quiz" : "Continue quiz"}
                  >
                    <ChevronRight />
                  </Link>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
