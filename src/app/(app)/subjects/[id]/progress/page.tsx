"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookOpen, Compass, Lightbulb, Loader2, Target } from "lucide-react";

import { SourceChips, SourcePathsContext } from "@/components/sources";
import { TopicRow } from "@/components/mastery";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { postJson } from "@/lib/api";
import { fetchAnswers, fetchDocuments, fetchQuizzes, useLoad } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { computeMastery } from "@/lib/mastery";
import type { SourceRef } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Explanation {
  explanation: string;
  keyPoints: string[];
  example: string | null;
  checkQuestion: string;
  notCovered: string | null;
  sources: SourceRef[];
}

export default function ProgressPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading } = useLoad(async () => {
    const [answers, quizzes, docs] = await Promise.all([fetchAnswers(id), fetchQuizzes(id, 30), fetchDocuments(id)]);
    return { answers, quizzes, docs };
  }, [id]);

  const mastery = useMemo(() => computeMastery(data?.answers ?? []), [data]);
  const weak = mastery.filter((m) => m.level === "needs_revision");
  const developing = mastery.filter((m) => m.level === "developing");
  const recommended = weak[0] ?? developing[0] ?? null;
  const paths = useMemo(() => Object.fromEntries((data?.docs ?? []).map((d) => [d.id, d.storage_path])), [data]);

  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, Explanation | { error: string }>>({});
  const [practising, setPractising] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  async function explain(topic: string) {
    setExplaining(topic);
    try {
      const res = await postJson<Explanation>("/api/explain", { subjectId: id, topic });
      setExplanations((e) => ({ ...e, [topic]: res }));
    } catch (err) {
      setExplanations((e) => ({ ...e, [topic]: { error: err instanceof Error ? err.message : "Failed." } }));
    } finally {
      setExplaining(null);
    }
  }

  async function practise() {
    setPractising(true);
    setPracticeError(null);
    try {
      const res = await postJson<{ quizId: string }>("/api/quiz", { subjectId: id, mode: "weak_topics" });
      router.push(`/subjects/${id}/quiz/${res.quizId}`);
    } catch (err) {
      setPracticeError(err instanceof Error ? err.message : "Could not create the practice quiz.");
      setPractising(false);
    }
  }

  if (loading) return <Skeleton className="h-64 rounded-xl" />;

  if (!mastery.length) {
    return (
      <div className="grid place-items-center rounded-xl bg-card px-6 py-14 text-center ring-1 ring-foreground/10">
        <p className="font-medium">No progress yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Take a quiz and RecallAI will track how well you know each topic and suggest what to revise next.
        </p>
        <Link href={`/subjects/${id}/quiz`} className={cn(buttonVariants(), "mt-5")}>
          Start a quiz
        </Link>
      </div>
    );
  }

  const completed = (data?.quizzes ?? []).filter((q) => q.answered > 0).slice(0, 12).reverse();

  return (
    <SourcePathsContext.Provider value={paths}>
      <div className="grid gap-8">
        {/* Recommendation */}
        <Card className="gap-3 border-primary/20 bg-primary/[0.03] px-5">
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <Compass className="size-4" /> Recommended next
          </p>
          {recommended ? (
            <>
              <p className="leading-relaxed">
                Revise <span className="font-semibold">{recommended.topic}</span> ({recommended.percent}% over{" "}
                {recommended.attempts} answers). Read the notes for this topic, then practise with{" "}
                {recommended.level === "needs_revision" ? "easier questions that rebuild the basics" : "medium-difficulty questions"}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/subjects/${id}/notes?topic=${encodeURIComponent(recommended.topic)}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <BookOpen /> Read notes
                </Link>
                <Button size="sm" variant="outline" onClick={() => explain(recommended.topic)} disabled={!!explaining}>
                  {explaining === recommended.topic ? <Loader2 className="animate-spin" /> : <Lightbulb />} Explain it
                  more simply
                </Button>
                <Button size="sm" onClick={practise} disabled={practising}>
                  {practising ? <Loader2 className="animate-spin" /> : <Target />} Practise weak topics
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="leading-relaxed">
                Every topic you have practised is at a strong level. Try challenge mode — harder questions on new
                angles — to make sure it sticks.
              </p>
              <Button size="sm" onClick={practise} disabled={practising} className="self-start">
                {practising ? <Loader2 className="animate-spin" /> : <Target />} Challenge mode
              </Button>
            </>
          )}
          {practiceError && <p className="text-sm text-destructive">{practiceError}</p>}
          {recommended && explanations[recommended.topic] && (
            <ExplanationBox value={explanations[recommended.topic]} />
          )}
        </Card>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Topic mastery */}
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Topic mastery</h2>
              <span className="text-xs text-muted-foreground">Strong ≥ 85% · Developing 60–84% · Revise &lt; 60%</span>
            </div>
            <Card className="mt-3 gap-0 divide-y px-5 py-1">
              {mastery.map((m) => (
                <div key={m.topic}>
                  <TopicRow
                    m={m}
                    extra={
                      m.level !== "strong" ? (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                          onClick={() => explain(m.topic)}
                          disabled={!!explaining}
                        >
                          {explaining === m.topic ? "Explaining…" : "Explain simply"}
                        </button>
                      ) : undefined
                    }
                  />
                  {m.topic !== recommended?.topic && explanations[m.topic] && (
                    <div className="pb-3">
                      <ExplanationBox value={explanations[m.topic]} />
                    </div>
                  )}
                </div>
              ))}
            </Card>
            <p className="mt-2 text-xs text-muted-foreground">
              Based on your most recent answers per topic. These are learning indicators, not predictions of exam
              results.
            </p>
          </section>

          {/* History */}
          <section>
            <h2 className="font-semibold">Quiz history</h2>
            <Card className="mt-3 px-5">
              <div className="flex h-28 items-end gap-1.5" aria-label="Quiz scores over time">
                {completed.map((q) => {
                  const pct = q.answered ? Math.round((q.score / q.answered) * 100) : 0;
                  return (
                    <Link
                      key={q.id}
                      href={`/subjects/${id}/quiz/${q.id}`}
                      title={`${pct}% · ${timeAgo(q.created_at)}`}
                      className="flex h-full flex-1 flex-col justify-end"
                    >
                      <div
                        className={cn(
                          "rounded-t-sm transition-colors hover:opacity-80",
                          pct >= 85 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive/80",
                        )}
                        style={{ height: `${Math.max(4, pct)}%` }}
                      />
                    </Link>
                  );
                })}
              </div>
              <ul className="grid gap-2 text-sm">
                {[...completed].reverse().slice(0, 6).map((q) => (
                  <li key={q.id}>
                    <Link href={`/subjects/${id}/quiz/${q.id}`} className="flex justify-between gap-2 hover:underline">
                      <span className="text-muted-foreground">{timeAgo(q.created_at)}</span>
                      <span className="tabular-nums">
                        {q.answered ? Math.round((q.score / q.answered) * 100) : 0}% · {q.answered}/{q.question_count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>
      </div>
    </SourcePathsContext.Provider>
  );
}

function ExplanationBox({ value }: { value: Explanation | { error: string } }) {
  if ("error" in value) return <p className="text-sm text-destructive">{value.error}</p>;
  return (
    <div className="animate-in-up grid gap-3 rounded-lg bg-background px-4 py-4 text-sm ring-1 ring-foreground/10">
      <p className="leading-relaxed whitespace-pre-line">{value.explanation}</p>
      {value.keyPoints.length > 0 && (
        <ul className="grid list-disc gap-1 pl-5">
          {value.keyPoints.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
      )}
      {value.example && (
        <p className="rounded-md bg-muted/60 px-3 py-2">
          <span className="font-medium">Example: </span>
          {value.example}
        </p>
      )}
      {value.notCovered && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Not covered in your PDFs: </span>
          {value.notCovered}
        </p>
      )}
      <p>
        <span className="font-medium">Check yourself: </span>
        {value.checkQuestion}
      </p>
      <SourceChips sources={value.sources} />
    </div>
  );
}
