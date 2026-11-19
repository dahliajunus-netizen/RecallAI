import { ocrPage } from "@/lib/ai/ocr";
import { authed, HttpError, readJson } from "@/lib/server/route";

export const maxDuration = 120;

const MAX_BYTES = 4_500_000;

export const POST = authed(async ({ req }) => {
  const body = await readJson<{ image?: string; mediaType?: string }>(req);
  if (typeof body.image !== "string" || !body.image) throw new HttpError("Missing page image.");
  if (body.image.length * 0.75 > MAX_BYTES) throw new HttpError("Page image is too large.", 413);
  const mediaType = body.mediaType === "image/png" ? "image/png" : "image/jpeg";
  return ocrPage(body.image, mediaType);
});
