import {
  COACHING_AI_MEAL_IMAGE_JPEG_QUALITY,
  COACHING_AI_MEAL_IMAGE_MAX_LONG_EDGE,
  COACHING_AI_MEAL_PHOTO_BUCKET,
} from "@/lib/coaching/ai/coaching-meal-photo-constants";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";

export type ProcessedCoachingMealImage = {
  buffer: Buffer;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  byteLength: number;
  originalWidth: number;
  originalHeight: number;
  originalByteLength: number;
};

export async function downloadCoachingMealPhotoFromStorage(storagePath: string): Promise<Buffer> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.storage.from(COACHING_AI_MEAL_PHOTO_BUCKET).download(storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? "meal_photo_download_failed");
  }

  return Buffer.from(await data.arrayBuffer());
}

export async function processCoachingMealImageForModel(input: Buffer): Promise<ProcessedCoachingMealImage> {
  const sharp = (await import("sharp")).default;

  const originalMetadata = await sharp(input).metadata();
  const processed = await sharp(input)
    .rotate()
    .resize({
      width: COACHING_AI_MEAL_IMAGE_MAX_LONG_EDGE,
      height: COACHING_AI_MEAL_IMAGE_MAX_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: COACHING_AI_MEAL_IMAGE_JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processed.data,
    mimeType: "image/jpeg",
    width: processed.info.width,
    height: processed.info.height,
    byteLength: processed.data.length,
    originalWidth: originalMetadata.width ?? 0,
    originalHeight: originalMetadata.height ?? 0,
    originalByteLength: input.length,
  };
}

/** Server-memory only — never persist or log. */
export function encodePreparedCoachingMealImageAsBase64(image: { buffer: Buffer }): string {
  return image.buffer.toString("base64");
}

export function assertNoBase64InPersistedPayload(serialized: string): void {
  if (/data:image\/[a-z+]+;base64,/i.test(serialized)) {
    throw new Error("Persisted payload must not contain base64 image data");
  }
}
