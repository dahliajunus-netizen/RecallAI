"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  GitCompareArrows,
  Lightbulb,
  ListChecks,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";

import { SourceChips } from "@/components/sources";
import type { MustRememberCategory, MustRememberItem, Origin, StudyGuide } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<MustRememberCategory, string> = {
  definition: "Definitions",
  concept: "Key concepts",
  person: "People",
  date_event: "Dates & events",
  process: "Processes & sequences",
  formula: "Formulas",
  classification: "Classifications",
};
const CATEGORY_ORDER: MustRememberCategory[] = [
  "definition",
  "concept",
  "process",
  "formula",
  "classification",
  "person",
  "date_event",
];

export function OriginTag({ origin }: { origin: Origin }) {
  return origin === "stated" ? (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
      From PDF
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-primary uppercase">
      <Sparkles className="size-2.5" /> AI explanation
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  count,
  defaultOpen = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl bg-card ring-1 ring-foreground/10">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium">
            {title}
            {count != null && <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>}
          </span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="animate-in-up border-t px-4 py-4 sm:px-5">{children}</div>}
    </section>
  );
}

function MustItem({ item }: { item: MustRememberItem }) {
  return (
    <li className="grid gap-1.5 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded bg-highlight px-1 font-semibold">{item.term}</span>
        <OriginTag origin={item.origin} />
      </div>
      <p className="leading-relaxed">{item.content}</p>
      {item.steps.length > 0 && (
        <ol className="ml-1 grid gap-1 border-l-2 border-primary/25 pl-4">
          {item.steps.map((s, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[25px] grid size-4 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      )}
      {item.application && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">When to use it: </span>
          {item.application}
        </p>
      )}
      <SourceChips sources={item.sources} />
    </li>
  );
}

export function NotesView({ guide, initialTopic }: { guide: StudyGuide; initialTopic?: string | null }) {
  const [topicFilter, setTopicFilter] = useState<string | null>(
    guide.topics.find((t) => t.name.toLowerCase() === initialTopic?.toLowerCase())?.name ?? null,
  );

  const byTopic = <T extends { topic: string }>(items: T[]) =>
    topicFilter ? items.filter((i) => i.topic.toLowerCase() === topicFilter.toLowerCase()) : items;

  const grouped = useMemo(() => {
    const items = byTopic(guide.mustRemember);
    return CATEGORY_ORDER.map((c) => ({ category: c, items: items.filter((i) => i.category === c) })).filter(
      (g) => g.items.length,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, topicFilter]);

  const understand = byTopic(guide.understand);

  return (
    <div className="grid gap-4">
      {/* Overview */}
      <div className="rounded-xl bg-card px-4 py-5 ring-1 ring-foreground/10 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight">{guide.title}</h2>
        <p className="mt-1.5 leading-relaxed text-muted-foreground">{guide.overview}</p>
        {guide.topics.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">Topics — tap to focus</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {guide.topics.map((t) => {
                const active = topicFilter === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    title={t.summary}
                    onClick={() => setTopicFilter(active ? null : t.name)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(guide.gaps.length > 0 || guide.conflicts.length > 0 || guide.meta.pagesUnreadable > 0) && (
        <div className="rounded-xl border border-warning/40 bg-warning/8 px-4 py-4 sm:px-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="size-4 text-warning" /> Missing, unclear or conflicting information
          </p>
          <ul className="mt-2 grid list-disc gap-1.5 pl-6 text-sm">
            {guide.meta.pagesUnreadable > 0 && (
              <li>
                {guide.meta.pagesUnreadable} page{guide.meta.pagesUnreadable === 1 ? "" : "s"} could not be read, so
                their content is not included in these notes.
              </li>
            )}
            {guide.gaps.map((g, i) => (
              <li key={`g${i}`}>{g}</li>
            ))}
            {guide.conflicts.map((c, i) => (
              <li key={`c${i}`}>
                <span className="font-medium">Documents disagree: </span>
                {c.description} <SourceChips sources={c.sources} className="ml-1 align-middle" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section
        icon={Star}
        title="Must remember"
        description="Definitions, key facts, processes and formulas"
        count={grouped.reduce((s, g) => s + g.items.length, 0)}
      >
        {grouped.length ? (
          <div className="grid gap-5">
            {grouped.map((g) => (
              <div key={g.category}>
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {CATEGORY_LABEL[g.category]}
                </h3>
                <ul className="divide-y">
                  {g.items.map((item, i) => (
                    <MustItem key={i} item={item} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <Empty />
        )}
      </Section>

      <Section
        icon={Lightbulb}
        title="Understand"
        description="Difficult ideas explained simply, and how topics connect"
        count={understand.length}
      >
        {understand.length ? (
          <ul className="divide-y">
            {understand.map((u, i) => (
              <li key={i} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-medium">{u.title}</h3>
                  <OriginTag origin={u.origin} />
                </div>
                <p className="leading-relaxed">{u.explanation}</p>
                {u.example && (
                  <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <span className="font-medium">Example: </span>
                    {u.example}
                  </div>
                )}
                {u.connections.length > 0 && (
                  <p className="text-xs text-muted-foreground">Connects to: {u.connections.join(", ")}</p>
                )}
                <SourceChips sources={u.sources} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section
        icon={GitCompareArrows}
        title="Commonly confused"
        description="Similar terms and ideas, and how to tell them apart"
        count={guide.commonlyConfused.length}
      >
        {guide.commonlyConfused.length ? (
          <ul className="grid gap-3">
            {guide.commonlyConfused.map((c, i) => (
              <li key={i} className="rounded-lg border px-3 py-3">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">
                  {c.terms.map((t, j) => (
                    <span key={j} className="flex items-center gap-1.5">
                      {j > 0 && <span className="text-xs text-muted-foreground">vs</span>}
                      <span className="rounded bg-highlight px-1">{t}</span>
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 leading-relaxed">{c.distinction}</p>
                {c.memoryTip && (
                  <p className="mt-1.5 flex gap-1.5 text-sm text-muted-foreground">
                    <Zap className="mt-0.5 size-3.5 shrink-0 text-primary" /> {c.memoryTip}
                  </p>
                )}
                <SourceChips sources={c.sources} className="mt-2" />
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No commonly confused terms found in this material." />
        )}
      </Section>

      <Section
        icon={ListChecks}
        title="Quick revision"
        description="The essentials to review right before an exam"
        count={guide.quickRevision.length}
      >
        <ul className="grid gap-2">
          {guide.quickRevision.map((q, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="leading-relaxed">
                {q.point} <SourceChips sources={q.sources} className="ml-1 align-middle" />
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Empty({ text = "Nothing for this topic." }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
