// Builds the document context sent to the model, and verifies every source
// reference the model returns against the real extracted page text.
// Pure functions: no I/O, so they are easy to test.

import type { SourceRef } from "@/lib/types";

export interface PageRow {
  document_id: string;
  page_number: number;
  text: string;
  method: "text" | "ocr" | "failed";
}

export interface DocRow {
  id: string;
  name: string;
}

export interface DocContext {
  /** Short key the model uses ("D1", "D2", ...) mapped to the document. */
  docs: Map<string, { id: string; name: string; pages: Map<number, PageRow> }>;
  /** Text block handed to the model. */
  text: string;
  pagesUsed: number;
  pagesUnreadable: number;
  chars: number;
}

/** Roughly 150k tokens of source text. Above this we ask the student to select fewer documents. */
export const MAX_CONTEXT_CHARS = 550_000;

export function buildDocContext(docs: DocRow[], pages: PageRow[]): DocContext {
  const map: DocContext["docs"] = new Map();
  const parts: string[] = [];
  let pagesUsed = 0;
  let pagesUnreadable = 0;

  docs.forEach((doc, i) => {
    const key = `D${i + 1}`;
    const docPages = pages
      .filter((p) => p.document_id === doc.id)
      .sort((a, b) => a.page_number - b.page_number);
    const pageMap = new Map<number, PageRow>();
    const body: string[] = [];
    for (const p of docPages) {
      pageMap.set(p.page_number, p);
      if (p.method === "failed" || !p.text.trim()) {
        pagesUnreadable++;
        body.push(`<page number="${p.page_number}" status="unreadable" />`);
        continue;
      }
      pagesUsed++;
      body.push(`<page number="${p.page_number}">\n${p.text.trim()}\n</page>`);
    }
    map.set(key, { id: doc.id, name: doc.name, pages: pageMap });
    parts.push(`<document key="${key}" name="${escapeAttr(doc.name)}">\n${body.join("\n")}\n</document>`);
  });

  const text = parts.join("\n\n");
  return { docs: map, text, pagesUsed, pagesUnreadable, chars: text.length };
}

function escapeAttr(s: string) {
  return s.replace(/[<>"&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" })[c]!);
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function matchQuote(quote: string, pageText: string): "exact" | "close" | "none" {
  const q = normalize(quote);
  if (!q) return "none";
  const p = normalize(pageText);
  if (p.includes(q)) return "exact";
  const qTokens = q.split(" ").filter((t) => t.length > 2);
  if (qTokens.length < 3) return "none";
  const pTokens = new Set(p.split(" "));
  const hits = qTokens.filter((t) => pTokens.has(t)).length;
  return hits / qTokens.length >= 0.8 ? "close" : "none";
}

export interface RawRef {
  doc: string;
  page: number;
  quote: string;
}

/**
 * Turns model-supplied references into verified SourceRefs.
 * - References to documents or pages that don't exist are removed (never shown).
 * - If the quote is not on the cited page but is on another page of the same
 *   document, the page number is corrected.
 * - Otherwise the reference is kept but marked "unverified".
 */
export function resolveRefs(
  raw: RawRef[],
  ctx: DocContext,
  stats: { removed: number },
): SourceRef[] {
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    // Accept the document key ("D1"); fall back to the file name if the model used that instead.
    const wanted = r.doc.trim();
    const doc =
      ctx.docs.get(wanted.toUpperCase()) ??
      [...ctx.docs.values()].find(
        (d) => normalize(d.name) === normalize(wanted) || normalize(d.name.replace(/\.pdf$/i, "")) === normalize(wanted),
      );
    if (!doc) {
      stats.removed++;
      continue;
    }
    let page = doc.pages.get(Math.round(r.page));
    let match: SourceRef["match"] = "unverified";
    if (page && page.method !== "failed") {
      const m = matchQuote(r.quote, page.text);
      if (m !== "none") match = m;
    } else {
      page = undefined;
    }
    if (match === "unverified") {
      // Look for the quote elsewhere in the same document.
      for (const candidate of doc.pages.values()) {
        if (candidate.method === "failed") continue;
        const m = matchQuote(r.quote, candidate.text);
        if (m !== "none") {
          page = candidate;
          match = m;
          break;
        }
      }
    }
    if (!page) {
      stats.removed++;
      continue;
    }
    const key = `${doc.id}:${page.page_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      documentId: doc.id,
      documentName: doc.name,
      page: page.page_number,
      quote: r.quote.slice(0, 300),
      match,
    });
  }
  return out;
}
