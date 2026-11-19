"use client";

// Extracts text from a PDF in the browser, page by page.
// Pages with no usable text layer (scanned pages) are rendered to an image and
// sent to the server for OCR. Pages that still cannot be read are reported,
// never silently dropped.

export interface ExtractedPage {
  page_number: number;
  text: string;
  method: "text" | "ocr" | "failed";
}

export interface ExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
  failedPages: number[];
  ocrPages: number[];
}

export type ProgressFn = (info: { stage: "reading" | "ocr"; done: number; total: number }) => void;

export class PdfError extends Error {}

const MIN_TEXT_CHARS = 40;
const MAX_PAGES = 400;

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | undefined;
function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

/** True when the extracted text looks like real words rather than an empty or broken text layer. */
export function looksReadable(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < MIN_TEXT_CHARS) return false;
  const letters = compact.match(/\p{L}/gu)?.length ?? 0;
  return letters / compact.length > 0.5;
}

export async function extractPdf(file: File, onProgress?: ProgressFn): Promise<ExtractionResult> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());

  const task = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") throw new PdfError("This PDF is password-protected. Remove the password and upload it again.");
    if (name === "InvalidPDFException") throw new PdfError("This file is not a valid PDF or is damaged.");
    throw new PdfError("This PDF could not be opened.");
  }

  if (doc.numPages > MAX_PAGES) {
    throw new PdfError(`This PDF has ${doc.numPages} pages. Please upload chapters of at most ${MAX_PAGES} pages.`);
  }

  const pages: ExtractedPage[] = [];
  const needsOcr: number[] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    onProgress?.({ stage: "reading", done: n - 1, total: doc.numPages });
    try {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (looksReadable(text)) {
        pages.push({ page_number: n, text, method: "text" });
      } else {
        needsOcr.push(n);
        pages.push({ page_number: n, text, method: "failed" });
      }
    } catch {
      needsOcr.push(n);
      pages.push({ page_number: n, text: "", method: "failed" });
    }
  }

  // OCR scanned pages, a few at a time.
  let done = 0;
  const queue = [...needsOcr];
  const worker = async () => {
    while (queue.length) {
      const n = queue.shift()!;
      onProgress?.({ stage: "ocr", done, total: needsOcr.length });
      const text = await ocrPage(doc, n).catch((err) => {
        console.warn(`OCR failed for page ${n}`, err);
        return null;
      });
      const target = pages[n - 1];
      if (text && text.replace(/\s+/g, "").length >= 10) {
        target.text = text;
        target.method = "ocr";
      }
      done++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  onProgress?.({ stage: "ocr", done: needsOcr.length, total: needsOcr.length });

  await task.destroy();
  return {
    pageCount: pages.length,
    pages,
    failedPages: pages.filter((p) => p.method === "failed").map((p) => p.page_number),
    ocrPages: pages.filter((p) => p.method === "ocr").map((p) => p.page_number),
  };
}

async function ocrPage(
  doc: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>,
  n: number,
): Promise<string | null> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 1600 / base.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // intent "print" avoids requestAnimationFrame, so OCR keeps working in a background tab.
  await page.render({ canvas, canvasContext: ctx, viewport, intent: "print" }).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  canvas.width = canvas.height = 0;

  const res = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl.split(",")[1], mediaType: "image/jpeg" }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { readable: boolean; text: string };
  return json.readable ? json.text : null;
}
