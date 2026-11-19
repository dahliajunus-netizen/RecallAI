# RecallAI

AI-powered study assistant. Students upload school PDFs (English or Bahasa Indonesia, text or scanned) and get:

- **A structured revision guide**: Must remember, Understand, Commonly confused, Quick revision. Every note links to its source PDF and page.
- **Mini-quizzes** (multiple choice, true/false, fill in the blank, short answer, application) with instant feedback, explanations and source pages.
- **Adaptive practice**: per-topic mastery, weak-topic quizzes at the right difficulty, simpler re-explanations, and retrying incorrect questions.

Stack: Next.js 15 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui, Supabase (Auth, Postgres, Storage), PDF.js, and an LLM: Claude API (`@anthropic-ai/sdk`, default) or Google Gemini API (`@google/genai`, has a free tier).

## Setup

1. **Install**

   ```bash
   npm install
   ```

   `postinstall` copies the PDF.js worker to `public/pdf.worker.min.mjs`.

2. **Create a Supabase project** and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the SQL editor (or `supabase db push`). It creates the tables, Row Level Security policies, and a private `pdfs` storage bucket.

3. **Environment variables**: copy `.env.example` to `.env.local`.

   | Variable | Where | Purpose |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Supabase anon / publishable key (safe to expose; RLS protects data) |
   | `AI_PROVIDER` | server | `anthropic` (default) or `gemini` |
   | `ANTHROPIC_API_KEY` | **server only** | Claude key from console.anthropic.com (pay-as-you-go; a Claude.ai subscription does not cover API use) |
   | `ANTHROPIC_MODEL` / `ANTHROPIC_FAST_MODEL` | server, optional | Default `claude-opus-5-5`. The fast model is used for grading and OCR |
   | `GEMINI_API_KEY` | **server only** | Gemini key from aistudio.google.com (free tier available) |
   | `GEMINI_MODEL` / `GEMINI_FAST_MODEL` | server, optional | Defaults `gemini-3.8-flash` / `gemini-3.5-flash-lite` (fast model: grading and OCR) |
   | `GEMINI_FALLBACK_MODEL` | server, optional | Used when the main model is overloaded, out of quota or too slow. Default `gemini-3.5-flash-lite` |

   AI keys are only read in server code (`src/lib/ai/*`, marked `server-only`). They never reach the browser. Both providers go through one function, `generateStructured()` in `src/lib/ai/client.ts`.

4. **Auth settings** (Supabase → Authentication → URL configuration): add `http://localhost:3000/auth/callback` (and your production URL) to the redirect URLs. If email confirmation is on, new users must click the link in their email before signing in.

5. **Run**

   ```bash
   npm run dev
   ```

   ```bash
   npm test
   ```

## How it works

```
Browser                                   Server (Next.js route handlers)        Claude
───────                                   ──────────────────────────────        ──────
PDF.js extracts text page by page
  └─ page without usable text ─────────▶  POST /api/ocr ───────────────────────▶ vision transcription
original PDF ──▶ Supabase Storage
pages (doc, page_number, text, method) ─▶ Supabase Postgres
                                          POST /api/notes  ── page-tagged text ─▶ structured JSON notes
                                          POST /api/quiz   ── + mastery, history ▶ structured JSON quiz
                                          POST /api/quiz/answer (deterministic grading,
                                                                 Claude for open answers)
                                          POST /api/explain (simpler re-explanation)
```

### Accuracy safeguards

- The model sees each document as `<document key="D1"><page number="N">…</page></document>` and must return, for every note and question, the document key, page number and a **word-for-word quote**.
- `src/lib/ai/sources.ts` checks every reference against the stored page text:
  - Document or page doesn't exist, or the page was unreadable → **reference removed** (never shown).
  - Quote found on a different page of the same document → page number **corrected**.
  - Quote not found anywhere → kept, shown with a dashed border and "?" as **unverified**.
- Quiz questions with no valid source are discarded.
- Notes label each item **From PDF** or **AI explanation**, and list missing/unclear information and conflicts between documents.
- Unreadable pages are recorded per document, shown in the UI, and marked as unreadable in the model input. They are never silently dropped.
- Structured outputs (JSON schema) + Zod validation make rendering reliable. Invalid or truncated output becomes a clear error, not a broken page.

### Adaptive learning

`src/lib/mastery.ts` computes per-topic mastery from the most recent 12 answers (recent and harder questions weigh more; partial credit counts 0.5):

- Strong: 85–100% → next practice at difficulty 3
- Developing: 60–84% → difficulty 2
- Needs revision: below 60% → difficulty 1, with simpler wording

Weak-topic quizzes focus on the lowest topics and pass previously asked questions to the model so it doesn't repeat them. These are learning indicators, not exam predictions.

## Project layout

```
src/app/(app)/page.tsx                    Dashboard
src/app/(app)/subjects/[id]/              Materials (upload), notes, quiz, progress
src/app/api/                              AI routes (auth required)
src/lib/ai/                               Claude client, prompts, schemas, source verification
src/lib/pdf/extract.ts                    In-browser extraction + OCR fallback
src/lib/upload.ts                         Upload pipeline (storage, pages, status)
src/lib/mastery.ts, src/lib/grading.ts    Pure learning logic (unit-tested)
supabase/migrations/0001_init.sql         Schema, RLS, storage bucket
tests/                                    Vitest unit tests
```

## Known limitations

- **Gemini free tier**: limits are small and change often (requests per minute and per day, per Google project), and Google may use free-tier prompts to improve its models, so avoid uploading private material on it. OCR on many scanned pages can hit the per-minute limit; the app retries with backoff and then shows a clear error. Check current limits in Google AI Studio. Gemini Flash notes are usually less thorough than Claude's; page references are verified the same way for both.

- **Length**: one notes/quiz request accepts about 550k characters of text (roughly 150k tokens, a few hundred pages). Above that the app asks you to select fewer documents. PDFs are limited to 50 MB and 400 pages each.
- **OCR** uses Claude's vision on each scanned page. Quality depends on scan quality. Handwriting and complex diagrams may be partly illegible (marked `[illegible]`). Each scanned page costs one API call.
- **Diagrams and images** in text-based PDFs are not analysed. Only their text is.
- **Processing time**: notes for a long chapter can take 1–3 minutes. On Vercel, routes set `maxDuration` up to 300 s, which needs a plan that allows it.
- **Answer keys** are stored in the student's own rows. The API never sends them before an answer is submitted, but a technically curious student could read their own rows with their session. This is acceptable for self-study, not for graded exams.
- AI grading of short answers is a learning aid and can occasionally misjudge an answer. The model answer and source page are always shown so the student can check.
