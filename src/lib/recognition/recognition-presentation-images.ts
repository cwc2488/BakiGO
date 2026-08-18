import convertHeic from "heic-convert";
import sharp from "sharp";
import { detectRecognitionImageFormat } from "@/lib/recognition/recognition-image-signature";
import { normalizedCropToPixelRect } from "@/lib/recognition/recognition-presentation-crop";
import type {
  RecognitionPreparedPortrait,
  RecognitionPresentationData,
} from "@/lib/recognition/recognition-presentation-types";
import type { RecognitionNormalizedCrop } from "@/types/recognition";
import { RecognitionServiceError } from "@/lib/recognition/recognition-service";

const PRESENTATION_JPEG_QUALITY = 90;
const PRESENTATION_MAX_EDGE = 1600;

export type RecognitionOriginalPhotoLoader = (input: {
  eventId: string;
  candidateId: string;
  sourceEntryId: string;
}) => Promise<{ mimeType: string; body: ArrayBuffer; path: string }>;

async function convertHeicBufferToJpeg(buffer: Buffer): Promise<Buffer> {
  const output = await convertHeic({
    buffer: new Uint8Array(buffer),
    format: "JPEG",
    quality: 0.9,
  });
  return Buffer.from(output);
}

/**
 * Decode a private original into a Sharp-readable bitmap.
 * JPEG/PNG/WEBP go through Sharp. HEIC/HEIF convert to JPEG first.
 * Original evidence is never written back.
 */
export async function decodeRecognitionOriginalForPresentation(
  buffer: Buffer,
  displayName: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const format = detectRecognitionImageFormat(buffer);
  let working = buffer;

  if (format === "heic" || format === "heif") {
    try {
      working = await convertHeicBufferToJpeg(buffer);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      throw new RecognitionServiceError(
        `無法轉換 HEIC 照片：${displayName}（${detail}）`,
        422,
      );
    }
  } else if (!format) {
    throw new RecognitionServiceError(`無法讀取照片格式：${displayName}`, 422);
  }

  try {
    const decoded = await sharp(working).rotate().toBuffer();
    const metadata = await sharp(decoded).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < 1 || height < 1) {
      throw new Error("missing dimensions");
    }
    return { buffer: decoded, width, height };
  } catch (error) {
    if (error instanceof RecognitionServiceError) throw error;
    throw new RecognitionServiceError(`無法處理照片：${displayName}`, 422);
  }
}

export async function cropRecognitionPortraitForPresentation(input: {
  originalBuffer: Buffer;
  originalWidth: number;
  originalHeight: number;
  crop: RecognitionNormalizedCrop;
}): Promise<{ jpegBuffer: Buffer; width: number; height: number }> {
  const rect = normalizedCropToPixelRect({
    originalWidth: input.originalWidth,
    originalHeight: input.originalHeight,
    crop: input.crop,
  });
  const extracted = sharp(input.originalBuffer).extract({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  });
  const resized = extracted.resize({
    width: PRESENTATION_MAX_EDGE,
    height: PRESENTATION_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });
  const jpegBuffer = await resized.jpeg({ quality: PRESENTATION_JPEG_QUALITY }).toBuffer();
  const metadata = await sharp(jpegBuffer).metadata();
  return {
    jpegBuffer,
    width: metadata.width ?? rect.width,
    height: metadata.height ?? rect.height,
  };
}

export async function loadRecognitionPresentationPortraits(input: {
  data: RecognitionPresentationData;
  loadOriginal: RecognitionOriginalPhotoLoader;
}): Promise<Map<string, RecognitionPreparedPortrait>> {
  const portraits = new Map<string, RecognitionPreparedPortrait>();
  for (const award of input.data.awards) {
    for (const candidate of award.candidates) {
      if (!candidate.requiresPhoto || !candidate.photo) continue;
      const original = await input.loadOriginal({
        eventId: input.data.event.id,
        candidateId: candidate.candidateId,
        sourceEntryId: candidate.photo.sourceEntryId,
      });
      const decoded = await decodeRecognitionOriginalForPresentation(
        Buffer.from(original.body),
        candidate.displayName,
      );
      const cropped = await cropRecognitionPortraitForPresentation({
        originalBuffer: decoded.buffer,
        originalWidth: decoded.width,
        originalHeight: decoded.height,
        crop: candidate.photo.crop,
      });
      portraits.set(candidate.candidateId, {
        candidateId: candidate.candidateId,
        jpegBuffer: cropped.jpegBuffer,
        width: cropped.width,
        height: cropped.height,
      });
    }
  }
  return portraits;
}

export function jpegBufferToPptxData(buffer: Buffer): string {
  return `image/jpeg;base64,${buffer.toString("base64")}`;
}

/**
 * Cover-fit the approved 3:4 presentation crop into a master viewport.
 * Center-crops as needed. Does not stretch and does not change admin crop metadata.
 */
export async function coverRecognitionPortraitToViewport(input: {
  jpegBuffer: Buffer;
  widthPx: number;
  heightPx: number;
}): Promise<{ jpegBuffer: Buffer; width: number; height: number }> {
  const jpegBuffer = await sharp(input.jpegBuffer)
    .resize({
      width: input.widthPx,
      height: input.heightPx,
      fit: "cover",
      position: "centre",
    })
    .jpeg({ quality: PRESENTATION_JPEG_QUALITY })
    .toBuffer();
  return {
    jpegBuffer,
    width: input.widthPx,
    height: input.heightPx,
  };
}
