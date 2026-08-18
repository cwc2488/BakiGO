import type { RecognitionNormalizedCrop } from "@/types/recognition";
import type { RecognitionPixelCropRect } from "@/lib/recognition/recognition-presentation-types";
import { RECOGNITION_CROP_BOUND_EPSILON } from "@/lib/recognition/recognition-photo-review";

/**
 * Convert Phase 6 normalized crop coordinates into an integer pixel rectangle
 * on the original (or EXIF-oriented) bitmap.
 *
 * The Admin crop is authoritative. This helper must not:
 * - choose a new center
 * - run face detection
 * - guess the honoree
 */
export function normalizedCropToPixelRect(input: {
  originalWidth: number;
  originalHeight: number;
  crop: RecognitionNormalizedCrop;
}): RecognitionPixelCropRect {
  const originalWidth = Math.max(1, Math.floor(input.originalWidth));
  const originalHeight = Math.max(1, Math.floor(input.originalHeight));

  let left = Math.round(input.crop.x * originalWidth);
  let top = Math.round(input.crop.y * originalHeight);
  let width = Math.round(input.crop.width * originalWidth);
  let height = Math.round(input.crop.height * originalHeight);

  left = Math.min(Math.max(0, left), originalWidth - 1);
  top = Math.min(Math.max(0, top), originalHeight - 1);
  width = Math.max(1, width);
  height = Math.max(1, height);

  if (left + width > originalWidth) {
    width = originalWidth - left;
  }
  if (top + height > originalHeight) {
    height = originalHeight - top;
  }

  return {
    left,
    top,
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/**
 * Place an already-cropped portrait into a 3:4 PPT frame.
 * Uses "cover" only to absorb 1px rounding — it does not recrop the original.
 */
export function fitCroppedPortraitToFrame(input: {
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
}): { width: number; height: number; offsetX: number; offsetY: number } {
  const imageAspect = input.imageWidth / input.imageHeight;
  const frameAspect = input.frameWidth / input.frameHeight;
  if (Math.abs(imageAspect - frameAspect) < RECOGNITION_CROP_BOUND_EPSILON * 10) {
    return {
      width: input.frameWidth,
      height: input.frameHeight,
      offsetX: 0,
      offsetY: 0,
    };
  }

  let width = input.frameWidth;
  let height = width / imageAspect;
  if (height < input.frameHeight) {
    height = input.frameHeight;
    width = height * imageAspect;
  }
  return {
    width,
    height,
    offsetX: (input.frameWidth - width) / 2,
    offsetY: (input.frameHeight - height) / 2,
  };
}

export function pixelRectFollowsNormalizedCrop(input: {
  originalWidth: number;
  originalHeight: number;
  crop: RecognitionNormalizedCrop;
  rect: RecognitionPixelCropRect;
}): boolean {
  const expected = normalizedCropToPixelRect(input);
  return (
    expected.left === input.rect.left
    && expected.top === input.rect.top
    && expected.width === input.rect.width
    && expected.height === input.rect.height
  );
}
