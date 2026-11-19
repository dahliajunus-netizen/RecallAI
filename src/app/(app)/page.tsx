"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderPlus,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";

import { LevelBadge, MasteryBar } from "@/components/mastery";
import { DeleteSubjectDialog, SubjectDialog } from "@/components/subject-dialogs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAnswers, fetchDocuments, fetchQuizzes, fetchSubjects, useLoad, type Subject } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { computeMastery, levelFor } from "@/lib/mastery";
import { cn } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Good morning" : h < 15 ? "Good afternoon" : h < 19 ? "Good evening" : "Good evening";
}

export default function DashboardPage() {
  const { data, error, loading, reload, setData } = useLoad(async () => {
    const [subjects, documents, quizzes, answers] = await Promise.all([
      fetchSubjects(),
      fetchDocuments(),
      fetchQuizzes(undefined, 8),
      fetchAnswers(),
    ]);
    return { subjects, documents, quizzes, answers };
  }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);

  const perSubject = useMemo(() => {
    const map = new Map<string, { docs: number; mastery: ReturnType<typeof computeMastery>; overall: number | null; lastActive: string }>();
    if (!data) return map;
    for (const s of data.subjects) {
      const answers = data.answers.filter((a) => a.subject_id === s.id);
      const docs = data.documents.filter((d) => d.subject_id === s.id);
      const mastery = computeMastery(answers);
      const overall = mastery.length ? Math.round(mastery.reduce((t, m) => t + m.percent, 0) / mastery.length) : null;
      const times = [s.created_at, ...docs.map((d) => d.created_at), ...answers.slice(0, 1).map((a) => a.created_at)];
      map.set(s.id, { docs: docs.length, mastery, overall, lastActive: times.sort().at(-1)! });
    }
    return map;
  }, [data]);

  const weakTopics = useMemo(() => {
    if (!data) return [];
    return data.subjects
      .flatMap((s) =>
        (perSubject.get(s.id)?.mastery ?? [])
          .filter((m) => m.level !== "strong")
          .map((m) => ({ ...m, subject: s })),
      )
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 6);
  }, [data, perSubject]);

  const stats = useMemo(() => {
    if (!data) return null;
    const recent = data.answers.slice(0, 50);
    const avg = recent.length ? Math.round((recent.reduce((s, a) => s + a.score, 0) / recent.length) * 100) : null;
    return {
      materials: data.documents.length,
      pages: data.documents.reduce((s, d) => s + d.page_count, 0),
      quizzes: data.quizzes.filter((q) => q.answered > 0).length,
      avg,
    };
  }, [data]);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Welcome */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">What are we studying today?</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-9 self-start sm:self-auto">
          <FolderPlus /> New subject
        </Button>
      </section>

      {/* Stats */}
      <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Study materials", value: stats?.materials, sub: stats ? `${stats.pages} pages` : "" },
          { label: "Subjects", value: data?.subjects.length, sub: "" },
          { label: "Quizzes taken", value: stats?.quizzes, sub: "recent" },
          { label: "Recent accuracy", value: stats?.avg != null ? `${stats.avg}%` : "—", sub: "last 50 answers" },
        ].map((s) => (
          <Card key={s.label} size="sm" className="px-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            {loading ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {s.value ?? 0}
                {s.sub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{s.sub}</span>}
              </p>
            )}
          </Card>
        ))}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
        {/* Subjects */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Subjects</h2>
          </div>
          {loading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : !data?.subjects.length ? (
            <EmptySubjects onCreate={() => setCreateOpen(true)} />
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.subjects.map((s) => {
                const info = perSubject.get(s.id)!;
                return (
                  <Card key={s.id} className="group relative gap-3 px-4 transition-shadow hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/subjects/${s.id}`} className="min-w-0 after:absolute after:inset-0">
                        <h3 className="truncate font-medium">{s.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {info.docs} PDF{info.docs === 1 ? "" : "s"} · active {timeAgo(info.lastActive)}
                        </p>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" className="relative z-10 -mr-1.5 -mt-1" aria-label={`Options for ${s.name}`}>
                              <MoreHorizontal />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setRenaming(s)}>
                            <Pencil /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(s)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="grid gap-1.5">
                      {info.overall != null ? (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Topic mastery</span>
                            <span className="font-medium tabular-nums">{info.overall}%</span>
                          </div>
                          <MasteryBar percent={info.overall} level={levelFor(info.overall)} />
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {info.docs ? "No quizzes yet" : "Upload a PDF to get started"}
                        </p>
                      )}
                    </div>
                    <div className="relative z-10 flex gap-2 pt-1">
                      <Link
                        href={`/subjects/${s.id}/notes`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        <BookOpen /> Notes
                      </Link>
                      <Link
                        href={`/subjects/${s.id}/quiz`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        <ListChecks /> Quiz
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Recent materials */}
          {!!data?.documents.length && (
            <div className="mt-10">
              <h2 className="font-semibold">Recent materials</h2>
              <Card className="mt-4 gap-0 py-1">
                {data.documents.slice(0, 6).map((d) => {
                  const subject = data.subjects.find((s) => s.id === d.subject_id);
                  return (
                    <Link
                      key={d.id}
                      href={`/subjects/${d.subject_id}`}
                      className="flex items-center gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/50"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {subject?.name} · {d.page_count} pages · {timeAgo(d.created_at)}
                        </p>
                      </div>
                      {d.status === "partial" && (
                        <span className="text-xs text-warning">{d.failed_pages.length} unreadable</span>
                      )}
                      {d.status === "failed" && <span className="text-xs text-destructive">Unreadable</span>}
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </Card>
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="space-y-10">
          <section>
            <h2 className="font-semibold">Topics to revise</h2>
            <Card className="mt-4 gap-0 px-4 py-1">
              {loading ? (
                <Skeleton className="my-3 h-16" />
              ) : weakTopics.length ? (
                weakTopics.map((t) => (
                  <Link
                    key={`${t.subject.id}:${t.topic}`}
                    href={`/subjects/${t.subject.id}/progress`}
                    className="grid gap-1.5 border-b py-3 last:border-0"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{t.topic}</span>
                      <span className="text-sm tabular-nums">{t.percent}%</span>
                    </div>
                    <MasteryBar percent={t.percent} level={t.level} />
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs text-muted-foreground">{t.subject.name}</span>
                      <LevelBadge level={t.level} />
                    </div>
                  </Link>
                ))
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  {data?.answers.length
                    ? "Nice — no weak topics right now."
                    : "Take a quiz and RecallAI will show the topics that need more revision here."}
                </p>
              )}
            </Card>
          </section>

          <section>
            <h2 className="font-semibold">Recent study sessions</h2>
            <Card className="mt-4 gap-0 py-1">
              {loading ? (
                <Skeleton className="mx-4 my-3 h-16" />
              ) : data?.quizzes.length ? (
                data.quizzes.map((q) => {
                  const pctScore = q.answered ? Math.round((q.score / q.answered) * 100) : null;
                  return (
                    <Link
                      key={q.id}
                      href={`/subjects/${q.subject_id}/quiz/${q.id}`}
                      className="flex items-center gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{q.subjectName}</p>
                        <p className="text-xs text-muted-foreground">
                          {q.mode === "weak_topics" ? "Weak-topic practice" : q.mode === "retry" ? "Retry" : "Quiz"} ·{" "}
                          {timeAgo(q.created_at)}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums">
                        {q.completed_at ? (
                          `${pctScore}%`
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {q.answered}/{q.question_count}
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })
              ) : (
                <p className="px-4 py-4 text-sm text-muted-foreground">No quizzes yet.</p>
              )}
            </Card>
          </section>
        </aside>
      </div>

      <SubjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(s) => setData((d) => (d ? { ...d, subjects: [...d.subjects, s] } : d))}
      />
      <SubjectDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        subject={renaming}
        onSaved={(s) =>
          setData((d) => (d ? { ...d, subjects: d.subjects.map((x) => (x.id === s.id ? s : x)) } : d))
        }
      />
      <DeleteSubjectDialog
        subject={deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        onDeleted={() => reload()}
      />
    </div>
  );
}

function EmptySubjects({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="mt-4 items-center px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-5" />
      </span>
      <div>
        <p className="font-medium">Create your first subject</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          A subject holds the PDFs for one topic or class. Upload a chapter and you can start studying from your
          notes within a few minutes.
        </p>
      </div>
      <Button onClick={onCreate}>
        <FolderPlus /> New subject
      </Button>
    </Card>
  );
}
