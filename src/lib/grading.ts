// Deterministic grading for closed questions. Pure: shared by server and tests.

import { normalize } from "@/lib/ai/sources";

export function gradeChoice(selectedIndex: number, correctIndex: number): 0 | 1 {
  return selectedIndex === correctIndex ? 1 : 0;
}

/** Levenshtein distance, used to forgive small typos in fill-in-the-blank answers. */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** Returns "exact" | "typo" | "wrong" for a fill-in-the-blank answer. */
export function gradeBlank(answer: string, accepted: string[]): "exact" | "typo" | "wrong" {
  const a = normalize(answer);
  if (!a) return "wrong";
  let best: "exact" | "typo" | "wrong" = "wrong";
  for (const raw of accepted) {
    const c = normalize(raw);
    if (!c) continue;
    if (a === c) return "exact";
    // Allow one typo per ~6 characters for longer words, never for short terms or numbers.
    const allowed = /^\d/.test(c) ? 0 : Math.floor(c.length / 6);
    if (allowed > 0 && editDistance(a, c) <= allowed) best = "typo";
  }
  return best;
}
