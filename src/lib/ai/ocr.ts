import "server-only";

import { z } from "zod";

import { generateStructured } from "./client";

const OcrSchema = z.object({
  readable: z.boolean().describe("false if the page is blank, too blurry, or has no meaningful text"),
  text: z.string().describe("All text on the page, transcribed exactly, in reading order"),
});

/** Transcribes a scanned page image (JPEG/PNG, base64) to text. Works for Indonesian and English. */
export async function ocrPage(imageBase64: string, mediaType: "image/jpeg" | "image/png") {
  const { data } = await generateStructured({
    schema: OcrSchema,
    fast: true,
    effort: "low",
    maxTokens: 8000,
    system:
      "You are an OCR engine. Transcribe the text on the page image exactly as written, in its original language (often Indonesian or English). Keep headings, lists, table rows and formulas on separate lines. Do not translate, summarise, correct or add anything. If a word is illegible write [illegible].",
    content: [
      { type: "image", mediaType, data: imageBase64 },
      { type: "text", text: "Transcribe this page." },
    ],
  });
  return data;
}
