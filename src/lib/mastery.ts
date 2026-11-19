// Topic mastery from answer history. Pure and deterministic.
// These are learning indicators, not predictions of exam scores.

import type { MasteryLevel, TopicMastery } from "@/lib/types";

export interface AnswerRow {
  topic: string;
  score: number;
  difficulty: number;
  created_at: string;
}

/** Most recent answers count most (exponential decay). Harder questions count a little more. */
const WINDOW = 12;

export function levelFor(percent: number): MasteryLevel {
  if (percent >= 85) return "strong";
  if (percent >= 60) return "developing";
  return "needs_revision";
}

export function computeMastery(rows: AnswerRow[]): TopicMastery[] {
  const byTopic = new Map<string, AnswerRow[]>();
  for (const r of rows) {
    const list = byTopic.get(r.topic) ?? [];
    list.push(r);
    byTopic.set(r.topic, list);
  }

  const result: TopicMastery[] = [];
  for (const [topic, list] of byTopic) {
    const recent = [...list]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, WINDOW);
    let weighted = 0;
    let total = 0;
    recent.forEach((r, i) => {
      // Each older answer counts 35% less, so recent progress shows quickly.
      const w = 0.65 ** i * (1 + (r.difficulty - 1) * 0.15);
      weighted += r.score * w;
      total += w;
    });
    const percent = Math.round((weighted / total) * 100);
    const level = levelFor(percent);

    // Trend: compare the newest half with the older half.
    const half = Math.floor(recent.length / 2);
    let trend: TopicMastery["trend"] = "flat";
    if (half >= 2) {
      const avg = (xs: AnswerRow[]) => xs.reduce((s, r) => s + r.score, 0) / xs.length;
      const diff = avg(recent.slice(0, half)) - avg(recent.slice(half));
      trend = diff > 0.15 ? "up" : diff < -0.15 ? "down" : "flat";
    }

    // Gradually raise difficulty as understanding improves.
    const nextDifficulty: 1 | 2 | 3 = level === "needs_revision" ? 1 : level === "developing" ? 2 : 3;
    result.push({ topic, percent, level, attempts: list.length, nextDifficulty, trend });
  }
  return result.sort((a, b) => a.percent - b.percent);
}

export const LEVEL_LABEL: Record<MasteryLevel, string> = {
  strong: "Strong understanding",
  developing: "Developing understanding",
  needs_revision: "Needs revision",
};
