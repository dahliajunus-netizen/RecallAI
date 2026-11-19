import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------
// AI_PROVIDER=anthropic (default) uses Claude. AI_PROVIDER=gemini uses Google's
// Gemini API, which has a free tier. Everything else in the app is provider-agnostic.

export type Provider = "anthropic" | "gemini";
export const PROVIDER: Provider = process.env.AI_PROVIDER === "gemini" ? "gemini" : "anthropic";

const MODELS: Record<Provider, { main: string; fast: string }> = {
  anthropic: {
    main: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    fast: process.env.ANTHROPIC_FAST_MODEL || process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  },
  gemini: {
    main: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    // Grading and OCR are simple; the Lite model is faster and usually less loaded.
    fast: process.env.GEMINI_FAST_MODEL || "gemini-3.5-flash-lite",
  },
};

/** The model used for notes and quizzes with the current provider. */
export const MODEL = MODELS[PROVIDER].main;

/** An error whose message is safe to show to the student. */
export class AIError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** Provider-neutral message content: plain text, or text and images (for OCR). */
export type AIContent =
  | string
  | ({ type: "text"; text: string } | { type: "image"; mediaType: "image/jpeg" | "image/png"; data: string })[];

interface StructuredRequest<T extends z.ZodType> {
  schema: T;
  system: string;
  content: AIContent;
  /** Use the cheaper/faster model (grading, OCR). */
  fast?: boolean;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

interface RawResult {
  text: string;
  model: string;
}

// ---------------------------------------------------------------------------
// JSON schema for structured output
// ---------------------------------------------------------------------------

const UNSUPPORTED_KEYWORDS = [
  "$schema",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
];

/** Recursively removes JSON-schema keywords that structured outputs does not accept. */
function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitize);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.includes(k)) continue;
    // Keep "properties" keys (user field names) untouched; sanitize their schemas.
    out[k] =
      k === "properties"
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, sanitize(pv)]))
        : sanitize(v);
  }
  return out;
}

/** Convert a Zod schema into the JSON schema subset accepted by structured outputs. */
export function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  return sanitize(z.toJSONSchema(schema, { target: "draft-7" })) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Calls the configured AI provider with a JSON-schema constrained output and validates it with Zod. */
export async function generateStructured<T extends z.ZodType>(
  req: StructuredRequest<T>,
): Promise<{ data: z.infer<T>; model: string }> {
  const raw = PROVIDER === "gemini" ? await callGemini(req) : await callAnthropic(req);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.text);
  } catch {
    throw new AIError("The AI returned an unreadable response. Please try again.");
  }
  const result = req.schema.safeParse(parsed);
  if (!result.success) {
    console.error("AI output failed validation", result.error.issues.slice(0, 5));
    throw new AIError("The AI returned an incomplete response. Please try again.");
  }
  return { data: result.data, model: raw.model };
}

const TOO_LONG = "The material is too long to process in one go. Select fewer documents and try again.";
const DECLINED = "The AI declined to process this material. Try a different document.";

// ---------------------------------------------------------------------------
// Anthropic (Claude)
// ---------------------------------------------------------------------------

let anthropic: Anthropic | undefined;

async function callAnthropic<T extends z.ZodType>({
  schema,
  system,
  content,
  fast,
  effort = "medium",
  maxTokens = 32000,
}: StructuredRequest<T>): Promise<RawResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AIError("The AI service is not configured. Set ANTHROPIC_API_KEY on the server.", 500);
  }
  anthropic ??= new Anthropic({ maxRetries: 3 });
  const model = fast ? MODELS.anthropic.fast : MODELS.anthropic.main;

  let message;
  try {
    const stream = anthropic.beta.messages.stream({
      model,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      // If a safety classifier declines, the API retries on a suitable fallback model.
      fallbacks: "default",
      system,
      messages: [
        {
          role: "user",
          content:
            typeof content === "string"
              ? content
              : content.map((c) =>
                  c.type === "text"
                    ? { type: "text" as const, text: c.text }
                    : {
                        type: "image" as const,
                        source: { type: "base64" as const, media_type: c.mediaType, data: c.data },
                      },
                ),
        },
      ],
      output_config: { effort, format: { type: "json_schema", schema: toOutputSchema(schema) } },
    });
    message = await stream.finalMessage();
  } catch (err) {
    throw mapAnthropicError(err);
  }

  if (message.stop_reason === "refusal") throw new AIError(DECLINED, 422);
  if (message.stop_reason === "max_tokens") throw new AIError(TOO_LONG, 413);

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  return { text, model: message.model };
}

function mapAnthropicError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AIError("The AI service rejected the server's API key. Check ANTHROPIC_API_KEY.", 500);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AIError("The AI service is busy right now. Wait a minute and try again.", 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("Anthropic bad request", err.message);
    return new AIError("The AI could not process this request (it may be too large).", 400);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AIError("Could not reach the AI service. Check your connection and try again.", 503);
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Anthropic API error", err.status, err.message);
    return new AIError("The AI service had a problem. Please try again.", 502);
  }
  console.error("Unexpected AI error", err);
  return new AIError("Something went wrong while talking to the AI.", 500);
}

// ---------------------------------------------------------------------------
// Google Gemini (free tier available)
// ---------------------------------------------------------------------------

let gemini: GoogleGenAI | undefined;

async function callGemini<T extends z.ZodType>({
  schema,
  system,
  content,
  fast,
  effort = "medium",
  maxTokens = 32000,
}: StructuredRequest<T>): Promise<RawResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new AIError("The AI service is not configured. Set GEMINI_API_KEY on the server.", 500);
  }
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const primary = fast ? MODELS.gemini.fast : MODELS.gemini.main;
  // Fast calls fall back to the main model; main calls fall back to a lighter model.
  const fallback = fast ? MODELS.gemini.main : process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

  const parts: Part[] =
    typeof content === "string"
      ? [{ text: content }]
      : content.map((c) => (c.type === "text" ? { text: c.text } : { inlineData: { mimeType: c.mediaType, data: c.data } }));

  const run = (model: string) =>
    withRetry(() =>
      gemini!.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: toOutputSchema(schema),
          maxOutputTokens: Math.min(maxTokens, 65000),
          // Under heavy load Gemini can stall for minutes; give up and try the fallback model instead.
          abortSignal: AbortSignal.timeout(fast ? 45_000 : effort === "high" ? 140_000 : 120_000),
          // Less thinking for simple calls (grading, OCR) keeps them fast; notes keep high.
          // thinkingLevel exists on Gemini 3+; older models keep their default.
          ...(/^gemini-[3-9]/.test(model) && {
            thinkingConfig: {
              thinkingLevel:
                effort === "low" ? ThinkingLevel.LOW : effort === "medium" ? ThinkingLevel.MEDIUM : ThinkingLevel.HIGH,
            },
          }),
        },
      }),
    );

  let res;
  let model = primary;
  try {
    try {
      res = await run(primary);
    } catch (err) {
      // When the main model is overloaded or out of quota, try a different model once.
      const status = err instanceof GeminiApiError ? err.status : 0;
      if (fallback === primary || !(status === 429 || status >= 500 || isTimeout(err))) throw err;
      console.warn(`Gemini ${primary} unavailable (${status}); falling back to ${fallback}`);
      model = fallback;
      res = await run(fallback);
    }
  } catch (err) {
    throw mapGeminiError(err);
  }

  if (res.promptFeedback?.blockReason) throw new AIError(DECLINED, 422);
  const finish = res.candidates?.[0]?.finishReason;
  if (finish === FinishReason.MAX_TOKENS) throw new AIError(TOO_LONG, 413);
  if (finish === FinishReason.SAFETY || finish === FinishReason.RECITATION) throw new AIError(DECLINED, 422);

  const text = res.text;
  if (!text) throw new AIError("The AI returned an empty response. Please try again.");
  return { text, model: res.modelVersion || model };
}

/** Retries rate-limit and server errors with backoff (free-tier limits are tight). */
async function withRetry<R>(fn: () => Promise<R>, attempts = 3): Promise<R> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof GeminiApiError ? err.status : 0;
      const retryable = status === 429 || status >= 500;
      if (!retryable || i >= attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
}

function isTimeout(err: unknown) {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

function mapGeminiError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (isTimeout(err)) {
    return new AIError("The AI service is very slow right now. Wait a minute and try again.", 504);
  }
  if (err instanceof GeminiApiError) {
    if (err.status === 400 && /api key/i.test(err.message)) {
      return new AIError("The AI service rejected the server's API key. Check GEMINI_API_KEY.", 500);
    }
    if (err.status === 401 || err.status === 403) {
      return new AIError("The AI service rejected the server's API key. Check GEMINI_API_KEY.", 500);
    }
    if (err.status === 429) {
      return new AIError(
        "The free AI quota is used up for now. Wait a minute (or until tomorrow for daily limits) and try again.",
        429,
      );
    }
    if (err.status === 503 || err.status === 500) {
      return new AIError("The AI service is overloaded right now. Wait a minute and try again.", 503);
    }
    if (err.status === 404) {
      return new AIError("The configured Gemini model was not found. Check GEMINI_MODEL.", 500);
    }
    if (err.status === 400) {
      console.error("Gemini bad request", err.message);
      return new AIError("The AI could not process this request (it may be too large).", 400);
    }
    console.error("Gemini API error", err.status, err.message);
    return new AIError("The AI service had a problem. Please try again.", 502);
  }
  console.error("Unexpected AI error", err);
  return new AIError("Could not reach the AI service. Check your connection and try again.", 503);
}
