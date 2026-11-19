import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { LEVEL_LABEL } from "@/lib/mastery";
import type { MasteryLevel, TopicMastery } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<MasteryLevel, { bar: string; badge: string }> = {
  strong: { bar: "bg-success", badge: "bg-success/12 text-success" },
  developing: { bar: "bg-warning", badge: "bg-warning/15 text-[color-mix(in_oklch,var(--warning),black_35%)] dark:text-warning" },
  needs_revision: { bar: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
};

export function LevelBadge({ level, className }: { level: MasteryLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        LEVEL_STYLE[level].badge,
        className,
      )}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function MasteryBar({ percent, level, className }: { percent: number; level: MasteryLevel; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", LEVEL_STYLE[level].bar)}
        style={{ width: `${Math.max(3, percent)}%` }}
      />
    </div>
  );
}

export function TopicRow({ m, extra }: { m: TopicMastery; extra?: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium">{m.topic}</p>
        <div className="flex shrink-0 items-center gap-2 text-sm tabular-nums">
          {m.trend === "up" && <ArrowUpRight className="size-3.5 text-success" aria-label="improving" />}
          {m.trend === "down" && <ArrowDownRight className="size-3.5 text-destructive" aria-label="declining" />}
          <span className="font-medium">{m.percent}%</span>
        </div>
      </div>
      <MasteryBar percent={m.percent} level={m.level} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {m.attempts} answer{m.attempts === 1 ? "" : "s"}
        </span>
        {extra ?? <LevelBadge level={m.level} />}
      </div>
    </div>
  );
}
