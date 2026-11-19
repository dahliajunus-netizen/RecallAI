import { describe, expect, it } from "vitest";

import { editDistance, gradeBlank, gradeChoice } from "@/lib/grading";
import { computeMastery, levelFor } from "@/lib/mastery";
import { looksReadable } from "@/lib/pdf/extract";

const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();

describe("grading", () => {
  it("grades choices by index", () => {
    expect(gradeChoice(2, 2)).toBe(1);
    expect(gradeChoice(0, 2)).toBe(0);
  });

  it("computes edit distance", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  it("accepts exact answers ignoring case and punctuation", () => {
    expect(gradeBlank("  Photosynthesis. ", ["photosynthesis"])).toBe("exact");
    expect(gradeBlank("klorofil", ["chlorophyll", "klorofil"])).toBe("exact");
  });

  it("forgives a small typo in long words only", () => {
    expect(gradeBlank("photosynthesys", ["photosynthesis"])).toBe("typo");
    expect(gradeBlank("cat", ["cot"])).toBe("wrong");
  });

  it("never forgives wrong numbers", () => {
    expect(gradeBlank("1946", ["1945"])).toBe("wrong");
    expect(gradeBlank("1945", ["1945"])).toBe("exact");
  });

  it("rejects empty answers", () => {
    expect(gradeBlank("   ", ["x"])).toBe("wrong");
  });
});

describe("mastery", () => {
  it("uses the documented thresholds", () => {
    expect(levelFor(85)).toBe("strong");
    expect(levelFor(84)).toBe("developing");
    expect(levelFor(60)).toBe("developing");
    expect(levelFor(59)).toBe("needs_revision");
  });

  it("computes per-topic levels and target difficulty, weakest first", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({ topic: "Cells", score: 1, difficulty: 2, created_at: at(i) })),
      ...Array.from({ length: 4 }, (_, i) => ({ topic: "Genetics", score: 0, difficulty: 1, created_at: at(i) })),
    ];
    const m = computeMastery(rows);
    expect(m.map((x) => x.topic)).toEqual(["Genetics", "Cells"]);
    expect(m[0]).toMatchObject({ level: "needs_revision", nextDifficulty: 1, attempts: 4 });
    expect(m[1]).toMatchObject({ level: "strong", nextDifficulty: 3, percent: 100 });
  });

  it("weights recent answers more and detects improvement", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({ topic: "T", score: 0, difficulty: 1, created_at: at(i) })),
      ...Array.from({ length: 4 }, (_, i) => ({ topic: "T", score: 1, difficulty: 1, created_at: at(10 + i) })),
    ];
    const [t] = computeMastery(rows);
    expect(t.percent).toBeGreaterThan(50);
    expect(t.trend).toBe("up");
  });

  it("counts partial credit", () => {
    const [t] = computeMastery([{ topic: "T", score: 0.5, difficulty: 1, created_at: at(0) }]);
    expect(t.percent).toBe(50);
  });
});

describe("looksReadable", () => {
  it("accepts normal text", () => {
    expect(
      looksReadable("Fotosintesis adalah proses pembuatan makanan oleh tumbuhan hijau dengan bantuan cahaya."),
    ).toBe(true);
  });

  it("rejects empty or near-empty text layers (scanned pages)", () => {
    expect(looksReadable("  12  ")).toBe(false);
  });

  it("rejects symbol garbage from broken font encodings", () => {
    expect(looksReadable("### $$$ %%% ^^^ &&& *** ((( ))) ___ +++ === ~~~ ||| <<< >>> 123 456")).toBe(false);
  });
});
