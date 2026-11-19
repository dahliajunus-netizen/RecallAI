import "server-only";

import { z } from "zod";

import type { StudyGuide } from "@/lib/types";
import { generateStructured, MODEL } from "./client";
import { resolveRefs, type DocContext } from "./sources";

const Ref = z.object({
  doc: z.string().describe('Document key, e.g. "D1"'),
  page: z.number().describe("Page number exactly as given in the <page number> tag"),
  quote: z
    .string()
    .describe("A short phrase (5-25 words) copied word-for-word from that page that supports the note"),
});
const Refs = z.array(Ref);
const Origin = z.enum(["stated", "ai_explanation"]);

export const NotesSchema = z.object({
  title: z.string(),
  language: z.enum(["en", "id", "mixed"]),
  overview: z.string().describe("2-4 sentences: what this material is about"),
  topics: z
    .array(z.object({ name: z.string(), summary: z.string() }))
    .describe("4-12 main topics. Names are reused as the `topic` field everywhere else."),
  mustRemember: z.array(
    z.object({
      category: z.enum([
        "definition",
        "concept",
        "person",
        "date_event",
        "process",
        "formula",
        "classification",
      ]),
      term: z.string(),
      content: z.string(),
      topic: z.string(),
      application: z.string().nullable().describe("Formulas only: when and how to use it"),
      steps: z.array(z.string()).describe("Processes/sequences only: ordered steps; otherwise empty"),
      origin: Origin,
      sources: Refs,
    }),
  ),
  understand: z.array(
    z.object({
      topic: z.string(),
      title: z.string(),
      explanation: z.string(),
      example: z.string().nullable(),
      connections: z.array(z.string()).describe("Other topic names this idea links to"),
      origin: Origin,
      sources: Refs,
    }),
  ),
  commonlyConfused: z.array(
    z.object({
      terms: z.array(z.string()),
      distinction: z.string(),
      memoryTip: z.string().nullable(),
      sources: Refs,
    }),
  ),
  quickRevision: z.array(z.object({ point: z.string(), sources: Refs })),
  gaps: z.array(z.string()),
  conflicts: z.array(z.object({ description: z.string(), sources: Refs })),
});

const SYSTEM = `You are RecallAI, a careful study assistant for middle-school and high-school students.
You turn school material into a revision guide that helps students understand and remember what matters.

ACCURACY RULES (most important):
- Use ONLY the documents provided. Never add facts, dates, names, numbers or formulas that are not in them.
- Keep the source's important terminology exactly (do not swap technical terms for synonyms).
- Every note needs at least one source reference: the document key, the page number from the <page number="..."> tag, and a short phrase copied word-for-word from that page. Never guess a page number.
- origin = "stated" when the note restates what the document says. origin = "ai_explanation" when you wrote a simplified explanation or example that is not in the document. Examples you invent must be clearly generic and must not introduce new facts about the subject.
- If something important is mentioned but not explained, or a page is unreadable, list it in "gaps". Do not fill gaps from your own knowledge.
- If two documents disagree, record it in "conflicts" with both references. Do not pick a side silently.
- Never claim or imply that something will be on an exam.

WHAT TO PRIORITISE (do not treat every sentence as equally important):
1. Ideas the source repeats or emphasises (headings, bold terms, boxes, summaries, learning objectives).
2. Definitions and key terminology.
3. Processes and sequences (keep the order).
4. Formulas, what each symbol means, and when to use them.
5. Explicit learning objectives and chapter summaries.
6. Ideas that connect several topics.
Skip filler, anecdotes and repeated examples unless they explain a key idea.

SECTIONS:
- mustRemember: definitions, key concepts, people, dates/events, processes (fill "steps"), formulas (fill "application"), classifications. Be complete: do not drop important items to keep the guide short.
- understand: the hard ideas explained simply, why things happen, relationships between topics, and an example where it helps.
- commonlyConfused: pairs or groups of terms/ideas students mix up, with the precise difference.
- quickRevision: 8-20 short bullet points covering the whole material, for review just before an exam.

STYLE:
- Write for a 12-15 year old: short sentences, everyday words, no unnecessary academic language.
- Write in the same language as the documents (Indonesian documents -> Indonesian notes, English -> English). Set "language" accordingly.
- Use plain text (no markdown). Formulas may use simple notation like "v = s / t".`;

export async function generateStudyGuide(ctx: DocContext): Promise<StudyGuide> {
  const { data, model } = await generateStructured({
    schema: NotesSchema,
    system: SYSTEM,
    effort: "high",
    maxTokens: 64000,
    content: `Here is the study material. Unreadable pages are marked status="unreadable".

${ctx.text}

Create the revision guide now, following every accuracy rule.`,
  });

  const stats = { removed: 0 };
  const r = (refs: z.infer<typeof Refs>) => resolveRefs(refs, ctx, stats);

  const guide: StudyGuide = {
    title: data.title,
    language: data.language,
    overview: data.overview,
    topics: data.topics,
    mustRemember: data.mustRemember.map((m) => ({ ...m, sources: r(m.sources) })),
    understand: data.understand.map((u) => ({ ...u, sources: r(u.sources) })),
    commonlyConfused: data.commonlyConfused.map((c) => ({ ...c, sources: r(c.sources) })),
    quickRevision: data.quickRevision.map((q) => ({ ...q, sources: r(q.sources) })),
    gaps: data.gaps,
    conflicts: data.conflicts.map((c) => ({ ...c, sources: r(c.sources) })),
    meta: {
      model: model || MODEL,
      generatedAt: new Date().toISOString(),
      pagesUsed: ctx.pagesUsed,
      pagesUnreadable: ctx.pagesUnreadable,
      referencesRemoved: stats.removed,
    },
  };
  return guide;
}
