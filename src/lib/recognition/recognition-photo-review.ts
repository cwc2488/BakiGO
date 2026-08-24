import { parseRecognitionPhotoRef } from "@/lib/recognition/recognition-photo-url";
import type {
  RecognitionEventPptReadiness,
  RecognitionNormalizedCrop,
  RecognitionPhotoReviewFlag,
  RecognitionPhotoReviewQueueFilter,
  RecognitionPresentationPhotoReadinessState,
  RecognitionPresentationValidation,
  RecognitionReviewStatus,
} from "@/types/recognition";

/**
 * Individual recognition-card portrait slot ratio (width:height).
 * Distinct from the 4:3 PPT *slide* ratio.
 *
 * 3:4 is a conservative reusable portrait that fits future 4:3 card slots
 * (name under photo, 12-person grid after padding, hero layouts) without
 * baking a rendered pixel size into crop metadata.
 */
export const RECOGNITION_PRESENTATION_CROP_ASPECT = {
  width: 3,
  height: 4,
  label: "3:4",
} as const;

export const RECOGNITION_PRESENTATION_CROP_ASPECT_RATIO =
  RECOGNITION_PRESENTATION_CROP_ASPECT.width / RECOGNITION_PRESENTATION_CROP_ASPECT.height;

export const RECOGNITION_LOW_RESOLUTION_MIN_EDGE = 600;
export const RECOGNITION_EXTREME_ASPECT_RATIO = 3;
export const RECOGNITION_CROP_BOUND_EPSILON = 1e-6;

export const RECOGNITION_PHOTO_REVIEW_FLAGS: readonly RecognitionPhotoReviewFlag[] = [
  "group_photo",
  "person_too_small",
  "text_heavy",
  "low_resolution",
  "blurry_or_unclear",
  "poor_composition",
  "wrong_orientation",
  "suspected_wrong_photo",
  "other",
] as const;

export const RECOGNITION_PHOTO_REVIEW_FLAG_LABELS: Record<RecognitionPhotoReviewFlag, string> = {
  group_photo: "可能為多人合照，需要人工確認",
  person_too_small: "人物過小",
  text_heavy: "文字過多",
  low_resolution: "解析度偏低",
  blurry_or_unclear: "模糊或不清楚",
  poor_composition: "構圖不佳",
  wrong_orientation: "方向不正確",
  suspected_wrong_photo: "疑似不是受表揚者照片",
  other: "其他",
};

export const RECOGNITION_LOW_RESOLUTION_WARNING = "圖片解析度偏低，投影時可能模糊";

export const RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY = "可能為多人合照，需要人工確認";

export const RECOGNITION_PREFERRED_SOURCE_CHANGED_ERROR =
  "preferred source changed; crop save rejected";

export const RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS = {
  noOriginalPhoto: "缺少需要的原始照片",
  invalidPhoto: "缺少有效照片",
  preferredNotSelected: "尚未選擇正式使用的照片",
  preferredMissingPhoto: "正式照片來源沒有原始照片",
  preferredNotInEvidence: "正式照片來源不屬於此候選人",
  noCrop: "尚未完成簡報裁切",
  invalidCrop: "裁切範圍無效",
  cropSourceMismatch: "裁切對應的照片已變更，請重新裁切",
  photoBlocked: "此照片已標記為不可用於簡報",
} as const;

export function isRecognitionPhotoReviewFlag(value: string): value is RecognitionPhotoReviewFlag {
  return (RECOGNITION_PHOTO_REVIEW_FLAGS as readonly string[]).includes(value);
}

export function validateRecognitionPhotoReviewFlags(flags: string[]): string | null {
  for (const flag of flags) {
    if (!isRecognitionPhotoReviewFlag(flag)) {
      return "unknown photo review flag";
    }
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseRecognitionNormalizedCrop(input: {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
} | null | undefined): RecognitionNormalizedCrop | null {
  if (!input) return null;
  const x = asFiniteNumber(input.x);
  const y = asFiniteNumber(input.y);
  const width = asFiniteNumber(input.width);
  const height = asFiniteNumber(input.height);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

export function validateRecognitionNormalizedCrop(
  crop: RecognitionNormalizedCrop | null | undefined,
): string | null {
  if (!crop) return "crop coordinates are required.";
  const { x, y, width, height } = crop;
  if (![x, y, width, height].every((value) => Number.isFinite(value))) {
    return "crop coordinates must be finite numbers.";
  }
  if (width <= 0 || height <= 0) {
    return "crop width and height must be greater than 0.";
  }
  if (x < 0 || y < 0 || x > 1 || y > 1) {
    return "crop origin must be within 0 and 1.";
  }
  if (x + width > 1 + RECOGNITION_CROP_BOUND_EPSILON || y + height > 1 + RECOGNITION_CROP_BOUND_EPSILON) {
    return "crop is out of bounds.";
  }
  return null;
}

export function cropMatchesPreferredSource(input: {
  crop: RecognitionNormalizedCrop | null | undefined;
  cropSourceEntryId: string | null | undefined;
  preferredSourceEntryId: string | null | undefined;
}): boolean {
  if (!input.crop || !input.cropSourceEntryId || !input.preferredSourceEntryId) return false;
  if (input.cropSourceEntryId !== input.preferredSourceEntryId) return false;
  return validateRecognitionNormalizedCrop(input.crop) === null;
}

export function defaultRecognitionCoverCrop(input: {
  originalWidth: number;
  originalHeight: number;
  aspectRatio?: number;
}): RecognitionNormalizedCrop {
  const aspect = input.aspectRatio ?? RECOGNITION_PRESENTATION_CROP_ASPECT_RATIO;
  const imageAspect = input.originalWidth / input.originalHeight;
  if (imageAspect > aspect) {
    const width = (aspect * input.originalHeight) / input.originalWidth;
    return { x: (1 - width) / 2, y: 0, width, height: 1 };
  }
  const height = input.originalWidth / (aspect * input.originalHeight);
  return { x: 0, y: (1 - height) / 2, width: 1, height };
}

export function clampRecognitionNormalizedCrop(
  crop: RecognitionNormalizedCrop,
): RecognitionNormalizedCrop {
  const width = Math.min(1, Math.max(RECOGNITION_CROP_BOUND_EPSILON, crop.width));
  const height = Math.min(1, Math.max(RECOGNITION_CROP_BOUND_EPSILON, crop.height));
  const x = Math.min(1 - width, Math.max(0, crop.x));
  const y = Math.min(1 - height, Math.max(0, crop.y));
  return { x, y, width, height };
}

/**
 * Keep a crop box at the configured *pixel* portrait ratio.
 * Normalized 0-1 space is not square unless the original image is square.
 */
export function constrainRecognitionCropToPortraitAspect(input: {
  crop: RecognitionNormalizedCrop;
  originalWidth: number;
  originalHeight: number;
  aspectRatio?: number;
}): RecognitionNormalizedCrop {
  const aspect = input.aspectRatio ?? RECOGNITION_PRESENTATION_CROP_ASPECT_RATIO;
  const pixelWidth = input.crop.width * input.originalWidth;
  const pixelHeightFromWidth = pixelWidth / aspect;
  let width = input.crop.width;
  let height = pixelHeightFromWidth / input.originalHeight;
  if (height > 1) {
    height = 1;
    width = (aspect * input.originalHeight) / input.originalWidth;
  }
  return clampRecognitionNormalizedCrop({
    x: input.crop.x,
    y: input.crop.y,
    width,
    height,
  });
}

export function recognitionHasLowResolutionWarning(input: {
  originalWidth: number | null | undefined;
  originalHeight: number | null | undefined;
}): boolean {
  if (!input.originalWidth || !input.originalHeight) return false;
  return Math.min(input.originalWidth, input.originalHeight) < RECOGNITION_LOW_RESOLUTION_MIN_EDGE;
}

export function recognitionHasExtremeAspectWarning(input: {
  originalWidth: number | null | undefined;
  originalHeight: number | null | undefined;
}): boolean {
  if (!input.originalWidth || !input.originalHeight) return false;
  const ratio = Math.max(input.originalWidth, input.originalHeight)
    / Math.min(input.originalWidth, input.originalHeight);
  return ratio > RECOGNITION_EXTREME_ASPECT_RATIO;
}

export function recognitionHasLandscapeOrientationHint(input: {
  originalWidth: number | null | undefined;
  originalHeight: number | null | undefined;
}): boolean {
  if (!input.originalWidth || !input.originalHeight) return false;
  return input.originalWidth > input.originalHeight;
}

export type RecognitionPresentationPhotoInput = {
  requiresPhoto: boolean;
  reviewStatus?: RecognitionReviewStatus;
  hasOriginalPhoto: boolean;
  originalPhotoStoragePath?: string | null;
  preferredSourceEntryId: string | null | undefined;
  preferredSourceBelongsToCandidate?: boolean;
  preferredSourceHasOriginalPhoto?: boolean;
  photoReview?: {
    sourceEntryId: string | null;
    crop: RecognitionNormalizedCrop | null;
    isBlocked: boolean;
    blockedReason?: string | null;
    flags?: RecognitionPhotoReviewFlag[];
    originalWidth?: number | null;
    originalHeight?: number | null;
  } | null;
};

function recognitionPhotoRefIsInvalid(input: RecognitionPresentationPhotoInput): boolean {
  if (input.originalPhotoStoragePath === undefined) return false;
  const parsed = parseRecognitionPhotoRef(input.originalPhotoStoragePath);
  const present = input.originalPhotoStoragePath != null && String(input.originalPhotoStoragePath).trim() !== "";
  return present && !parsed.ok;
}

export function recognitionPresentationPhotoReadinessState(
  input: RecognitionPresentationPhotoInput,
): RecognitionPresentationPhotoReadinessState {
  if (!input.requiresPhoto) return "not_required";
  if (input.photoReview?.isBlocked) return "photo_blocked";
  if (recognitionPhotoRefIsInvalid(input)) return "invalid_photo";
  if (!input.hasOriginalPhoto) return "no_original_photo";
  if (!input.preferredSourceEntryId) return "preferred_source_not_selected";
  if (input.preferredSourceBelongsToCandidate === false) return "preferred_source_not_selected";
  if (input.preferredSourceHasOriginalPhoto === false) return "no_original_photo";
  if (!cropMatchesPreferredSource({
    crop: input.photoReview?.crop,
    cropSourceEntryId: input.photoReview?.sourceEntryId,
    preferredSourceEntryId: input.preferredSourceEntryId,
  })) {
    return "needs_photo_review";
  }
  return "crop_ready";
}

export function recognitionPresentationPhotoBlockers(
  input: RecognitionPresentationPhotoInput,
): string[] {
  const state = recognitionPresentationPhotoReadinessState(input);
  if (state === "not_required" || state === "crop_ready") return [];
  switch (state) {
    case "no_original_photo":
      return input.preferredSourceEntryId && input.preferredSourceHasOriginalPhoto === false
        ? [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.preferredMissingPhoto]
        : [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.noOriginalPhoto];
    case "invalid_photo":
      return [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.invalidPhoto];
    case "preferred_source_not_selected":
      return input.preferredSourceBelongsToCandidate === false
        ? [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.preferredNotInEvidence]
        : [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.preferredNotSelected];
    case "photo_blocked":
      return [
        input.photoReview?.blockedReason?.trim()
          || RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.photoBlocked,
      ];
    case "needs_photo_review": {
      if (
        input.photoReview?.crop
        && input.photoReview.sourceEntryId
        && input.preferredSourceEntryId
        && input.photoReview.sourceEntryId !== input.preferredSourceEntryId
      ) {
        return [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.cropSourceMismatch];
      }
      if (input.photoReview?.crop && validateRecognitionNormalizedCrop(input.photoReview.crop)) {
        return [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.invalidCrop];
      }
      return [RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.noCrop];
    }
    default:
      return [];
  }
}

export function recognitionPresentationPhotoWarnings(
  input: RecognitionPresentationPhotoInput,
): string[] {
  const warnings: string[] = [];
  if (recognitionHasLowResolutionWarning({
    originalWidth: input.photoReview?.originalWidth,
    originalHeight: input.photoReview?.originalHeight,
  })) {
    warnings.push(RECOGNITION_LOW_RESOLUTION_WARNING);
  }
  if (recognitionHasExtremeAspectWarning({
    originalWidth: input.photoReview?.originalWidth,
    originalHeight: input.photoReview?.originalHeight,
  })) {
    warnings.push("圖片長寬比極端，投影構圖可能不佳");
  }
  if (recognitionHasLandscapeOrientationHint({
    originalWidth: input.photoReview?.originalWidth,
    originalHeight: input.photoReview?.originalHeight,
  })) {
    warnings.push("原始照片為橫向，請確認人像裁切範圍");
  }
  for (const flag of input.photoReview?.flags ?? []) {
    if (flag === "group_photo") {
      warnings.push(RECOGNITION_GROUP_PHOTO_MANUAL_REVIEW_COPY);
      continue;
    }
    warnings.push(RECOGNITION_PHOTO_REVIEW_FLAG_LABELS[flag]);
  }
  return [...new Set(warnings)];
}

/**
 * PPT-photo-ready for one candidate.
 * Name-only awards are ready without a crop.
 * Warning flags never make this false; structural blockers and photo_blocked do.
 */
export function isRecognitionPresentationPhotoReady(
  input: RecognitionPresentationPhotoInput,
): boolean {
  if (input.reviewStatus !== undefined && input.reviewStatus !== "approved") {
    return false;
  }
  return recognitionPresentationPhotoReadinessState(input) === "crop_ready"
    || recognitionPresentationPhotoReadinessState(input) === "not_required";
}

export function validateRecognitionPresentationPhoto(
  input: RecognitionPresentationPhotoInput,
): RecognitionPresentationValidation {
  const readinessState = recognitionPresentationPhotoReadinessState(input);
  const hasPresentationCrop = cropMatchesPreferredSource({
    crop: input.photoReview?.crop,
    cropSourceEntryId: input.photoReview?.sourceEntryId,
    preferredSourceEntryId: input.preferredSourceEntryId,
  });
  const photoReady = isRecognitionPresentationPhotoReady(input);
  return {
    photoReady,
    readinessState,
    hasPresentationCrop,
    blockers: photoReady ? [] : recognitionPresentationPhotoBlockers(input),
    warnings: recognitionPresentationPhotoWarnings(input),
  };
}

export function warningFlagsDoNotBlockPresentation(input: {
  requiresPhoto: boolean;
  reviewStatus: RecognitionReviewStatus;
  hasOriginalPhoto: boolean;
  preferredSourceEntryId: string;
  crop: RecognitionNormalizedCrop;
  flags: RecognitionPhotoReviewFlag[];
}): boolean {
  return isRecognitionPresentationPhotoReady({
    requiresPhoto: input.requiresPhoto,
    reviewStatus: input.reviewStatus,
    hasOriginalPhoto: input.hasOriginalPhoto,
    preferredSourceEntryId: input.preferredSourceEntryId,
    preferredSourceBelongsToCandidate: true,
    preferredSourceHasOriginalPhoto: true,
    photoReview: {
      sourceEntryId: input.preferredSourceEntryId,
      crop: input.crop,
      isBlocked: false,
      flags: input.flags,
    },
  });
}

export function structuralPhotoBlockerCannotBeBypassed(input: {
  requiresPhoto: boolean;
  reviewStatus: RecognitionReviewStatus;
  hasOriginalPhoto: boolean;
  preferredSourceEntryId: string | null;
  crop: RecognitionNormalizedCrop | null;
  isBlocked: boolean;
}): boolean {
  return !isRecognitionPresentationPhotoReady({
    requiresPhoto: input.requiresPhoto,
    reviewStatus: input.reviewStatus,
    hasOriginalPhoto: input.hasOriginalPhoto,
    preferredSourceEntryId: input.preferredSourceEntryId,
    preferredSourceBelongsToCandidate: true,
    preferredSourceHasOriginalPhoto: input.hasOriginalPhoto,
    photoReview: {
      sourceEntryId: input.preferredSourceEntryId,
      crop: input.crop,
      isBlocked: input.isBlocked,
    },
  });
}

export function matchesRecognitionPhotoReviewQueueFilter(input: {
  requiresPhoto: boolean;
  readinessState: RecognitionPresentationPhotoReadinessState;
  filter: RecognitionPhotoReviewQueueFilter;
}): boolean {
  if (!input.requiresPhoto) return false;
  switch (input.filter) {
    case "all-photo-required":
      return true;
    case "needs-review":
      return input.readinessState === "needs_photo_review";
    case "crop-ready":
      return input.readinessState === "crop_ready";
    case "blocked":
      return input.readinessState === "photo_blocked";
    case "missing-photo":
      return input.readinessState === "no_original_photo" || input.readinessState === "invalid_photo";
    case "no-preferred-photo":
      return input.readinessState === "preferred_source_not_selected";
    default:
      return false;
  }
}

export function nextRecognitionPhotoReviewCandidateId(input: {
  items: Array<{ candidateId: string; readinessState: RecognitionPresentationPhotoReadinessState }>;
  currentCandidateId: string;
}): string | null {
  const actionable = new Set<RecognitionPresentationPhotoReadinessState>([
    "no_original_photo",
    "invalid_photo",
    "preferred_source_not_selected",
    "needs_photo_review",
    "photo_blocked",
  ]);
  const currentIndex = input.items.findIndex((item) => item.candidateId === input.currentCandidateId);
  const searchFrom = currentIndex < 0 ? 0 : currentIndex + 1;
  const ordered = [
    ...input.items.slice(searchFrom),
    ...input.items.slice(0, Math.max(searchFrom, 0)),
  ];
  const next = ordered.find((item) => (
    item.candidateId !== input.currentCandidateId
    && actionable.has(item.readinessState)
  ));
  return next?.candidateId ?? null;
}

export function buildRecognitionEventPptReadiness(input: {
  candidates: Array<{
    reviewStatus: RecognitionReviewStatus;
    requiresPhoto: boolean;
    hasOriginalPhoto: boolean;
    originalPhotoStoragePath?: string | null;
    preferredSourceEntryId: string | null;
    preferredSourceBelongsToCandidate?: boolean;
    preferredSourceHasOriginalPhoto?: boolean;
    photoReview?: RecognitionPresentationPhotoInput["photoReview"];
  }>;
}): RecognitionEventPptReadiness {
  const approved = input.candidates.filter((candidate) => candidate.reviewStatus === "approved");
  const photoRequired = approved.filter((candidate) => candidate.requiresPhoto);
  let readyPhotos = 0;
  let missingOriginalPhotos = 0;
  let invalidPhotos = 0;
  let missingPreferredPhoto = 0;
  let missingCrop = 0;
  let blockedPhotos = 0;

  for (const candidate of photoRequired) {
    const state = recognitionPresentationPhotoReadinessState(candidate);
    switch (state) {
      case "crop_ready":
        readyPhotos += 1;
        break;
      case "no_original_photo":
        missingOriginalPhotos += 1;
        break;
      case "invalid_photo":
        invalidPhotos += 1;
        break;
      case "preferred_source_not_selected":
        missingPreferredPhoto += 1;
        break;
      case "needs_photo_review":
        missingCrop += 1;
        break;
      case "photo_blocked":
        blockedPhotos += 1;
        break;
      default:
        break;
    }
  }

  return {
    totalApproved: approved.length,
    photoRequiredApproved: photoRequired.length,
    readyPhotos,
    missingOriginalPhotos,
    invalidPhotos,
    missingPreferredPhoto,
    missingCrop,
    blockedPhotos,
    totalBlockingIssues: missingOriginalPhotos + invalidPhotos + missingPreferredPhoto + missingCrop + blockedPhotos,
  };
}

export function recognitionPhotoReviewTouchesOriginalEvidence(keys: string[]): boolean {
  const forbidden = new Set([
    "original_photo_storage_path",
    "submitted_name",
    "submitter_name",
    "submitter_organization",
  ]);
  return keys.some((key) => forbidden.has(key));
}
