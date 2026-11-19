"use client";

import { extractPdf, PdfError, type ProgressFn } from "@/lib/pdf/extract";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function validatePdf(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Only PDF files are supported.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES) return "This PDF is larger than 50 MB. Split it into smaller chapters.";
  return null;
}

export interface UploadOutcome {
  status: "ready" | "partial" | "failed";
  pageCount: number;
  failedPages: number[];
  ocrPages: number[];
}

/**
 * Full pipeline for one PDF: create the document row, store the original file,
 * extract text page by page (OCR for scanned pages), save pages, set the final status.
 */
export async function uploadPdf(
  subjectId: string,
  file: File,
  onStage: (stage: "uploading" | "reading" | "ocr" | "saving", progress: number) => void,
): Promise<UploadOutcome> {
  const sb = getSupabaseBrowser();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Please sign in again.");

  const { data: doc, error } = await sb
    .from("documents")
    .insert({ subject_id: subjectId, name: file.name, status: "processing" })
    .select("id")
    .single();
  if (error || !doc) throw new Error("Could not create the document.");

  const fail = (message: string): never => {
    throw new Error(message);
  };

  try {
    onStage("uploading", 0);
    const path = `${auth.user.id}/${doc.id}.pdf`;
    const storeOriginal = sb.storage
      .from("pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: true });

    const onProgress: ProgressFn = ({ stage, done, total }) =>
      onStage(stage, total ? Math.round((done / total) * 100) : 0);

    let result;
    try {
      result = await extractPdf(file, onProgress);
    } catch (err) {
      return fail(err instanceof PdfError ? err.message : "Could not read this PDF.");
    }

    const stored = await storeOriginal;
    // The extracted text is what RecallAI studies from, so a storage failure is not fatal.
    const storagePath = stored.error ? null : path;

    onStage("saving", 0);
    for (let i = 0; i < result.pages.length; i += 50) {
      const chunk = result.pages.slice(i, i + 50).map((p) => ({ ...p, document_id: doc.id }));
      const { error: pErr } = await sb.from("document_pages").insert(chunk);
      if (pErr) return fail("Could not save the extracted text.");
      onStage("saving", Math.round(((i + chunk.length) / result.pages.length) * 100));
    }

    const readable = result.pageCount - result.failedPages.length;
    const status = readable === 0 ? "failed" : result.failedPages.length ? "partial" : "ready";
    await sb
      .from("documents")
      .update({
        status,
        page_count: result.pageCount,
        failed_pages: result.failedPages,
        ocr_pages: result.ocrPages,
        storage_path: storagePath,
        error: readable === 0 ? "No readable text was found on any page, even with OCR." : null,
      })
      .eq("id", doc.id);

    return { status, pageCount: result.pageCount, failedPages: result.failedPages, ocrPages: result.ocrPages };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong while processing this PDF.";
    // Never leave a document stuck in "processing", and clean up partial data.
    await sb.storage.from("pdfs").remove([`${auth.user.id}/${doc.id}.pdf`]);
    await sb.from("document_pages").delete().eq("document_id", doc.id);
    await sb.from("documents").update({ status: "failed", error: message }).eq("id", doc.id);
    throw new Error(message);
  }
}

export async function deleteDocument(id: string, storagePath: string | null) {
  const sb = getSupabaseBrowser();
  if (storagePath) await sb.storage.from("pdfs").remove([storagePath]);
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) throw new Error("Could not remove the document.");
}

export async function openOriginal(storagePath: string) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.storage.from("pdfs").createSignedUrl(storagePath, 300);
  if (error || !data) throw new Error("Could not open the original PDF.");
  return data.signedUrl;
}
