import { describe, expect, it } from "vitest";

import { buildDocContext, matchQuote, normalize, resolveRefs } from "@/lib/ai/sources";

const docs = [
  { id: "doc-a", name: "Biologi Bab 2.pdf" },
  { id: "doc-b", name: "Cells.pdf" },
];
const pages = [
  {
    document_id: "doc-a",
    page_number: 1,
    text: "Fotosintesis adalah proses pembuatan makanan oleh tumbuhan hijau.",
    method: "text" as const,
  },
  { document_id: "doc-a", page_number: 2, text: "", method: "failed" as const },
  {
    document_id: "doc-a",
    page_number: 3,
    text: "Klorofil menyerap cahaya matahari untuk fotosintesis.",
    method: "ocr" as const,
  },
  {
    document_id: "doc-b",
    page_number: 1,
    text: "The mitochondria is where cellular respiration releases energy.",
    method: "text" as const,
  },
];

describe("buildDocContext", () => {
  it("keys documents and counts readable and unreadable pages", () => {
    const ctx = buildDocContext(docs, pages);
    expect([...ctx.docs.keys()]).toEqual(["D1", "D2"]);
    expect(ctx.pagesUsed).toBe(3);
    expect(ctx.pagesUnreadable).toBe(1);
    expect(ctx.text).toContain('<page number="2" status="unreadable" />');
    expect(ctx.text).toContain('<document key="D2" name="Cells.pdf">');
  });
});

describe("normalize / matchQuote", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalize("  Café, NAÏVE!  ")).toBe("cafe naive");
  });

  it("finds exact and close quotes and rejects unrelated text", () => {
    const page = "The mitochondria is where cellular respiration releases energy.";
    expect(matchQuote("cellular respiration releases energy", page)).toBe("exact");
    expect(matchQuote("mitochondria where cellular respiration releases the energy", page)).toBe("close");
    expect(matchQuote("photosynthesis happens in chloroplasts", page)).toBe("none");
  });
});

describe("resolveRefs", () => {
  const ctx = buildDocContext(docs, pages);

  it("keeps verified references with real document ids", () => {
    const stats = { removed: 0 };
    const refs = resolveRefs([{ doc: "D1", page: 1, quote: "proses pembuatan makanan" }], ctx, stats);
    expect(refs).toEqual([
      {
        documentId: "doc-a",
        documentName: "Biologi Bab 2.pdf",
        page: 1,
        quote: "proses pembuatan makanan",
        match: "exact",
      },
    ]);
    expect(stats.removed).toBe(0);
  });

  it("removes references to documents or pages that do not exist", () => {
    const stats = { removed: 0 };
    const refs = resolveRefs(
      [
        { doc: "D9", page: 1, quote: "anything" },
        { doc: "D1", page: 42, quote: "invented page" },
      ],
      ctx,
      stats,
    );
    expect(refs).toEqual([]);
    expect(stats.removed).toBe(2);
  });

  it("corrects the page number when the quote is on another page", () => {
    const refs = resolveRefs([{ doc: "D1", page: 1, quote: "Klorofil menyerap cahaya matahari" }], ctx, {
      removed: 0,
    });
    expect(refs[0].page).toBe(3);
    expect(refs[0].match).toBe("exact");
  });

  it("never cites an unreadable page", () => {
    const stats = { removed: 0 };
    expect(resolveRefs([{ doc: "D1", page: 2, quote: "nothing here" }], ctx, stats)).toEqual([]);
    expect(stats.removed).toBe(1);
  });

  it("keeps an existing page with an unmatched quote, marked unverified", () => {
    const refs = resolveRefs([{ doc: "d2", page: 1, quote: "ribosomes make proteins" }], ctx, { removed: 0 });
    expect(refs[0]).toMatchObject({ documentId: "doc-b", page: 1, match: "unverified" });
  });

  it("accepts the document file name instead of the key", () => {
    const refs = resolveRefs([{ doc: "Cells.pdf", page: 1, quote: "cellular respiration" }], ctx, { removed: 0 });
    expect(refs[0]).toMatchObject({ documentId: "doc-b", match: "exact" });
    const refs2 = resolveRefs([{ doc: "Biologi Bab 2", page: 1, quote: "proses pembuatan" }], ctx, { removed: 0 });
    expect(refs2[0]).toMatchObject({ documentId: "doc-a" });
  });

  it("deduplicates references to the same page", () => {
    const refs = resolveRefs(
      [
        { doc: "D2", page: 1, quote: "mitochondria" },
        { doc: "D2", page: 1, quote: "cellular respiration" },
      ],
      ctx,
      { removed: 0 },
    );
    expect(refs).toHaveLength(1);
  });
});
