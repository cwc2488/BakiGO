import { PRIMARY_MEAL_SLOTS, type CoachingMealSlot, type PrimaryMealSlot } from "@/types/coaching";

const PRIMARY_MEAL_SLOT_SET = new Set<string>(PRIMARY_MEAL_SLOTS);

export type ParsedCoachingMealPhotoPath = {
  customerId: string;
  enrollmentId: string;
  logDate: string;
  mealSlot: PrimaryMealSlot;
  photoId: string;
};

const MEAL_PHOTO_PATH_PATTERN =
  /^([^/]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/(breakfast|lunch|dinner)\/([^/]+\.jpg)$/;

export function isPrimaryMealSlotForImages(mealSlot: string): mealSlot is PrimaryMealSlot {
  return PRIMARY_MEAL_SLOT_SET.has(mealSlot);
}

export function parseCoachingMealPhotoPath(storagePath: string): ParsedCoachingMealPhotoPath | null {
  const normalized = storagePath.trim();
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    return null;
  }

  const match = MEAL_PHOTO_PATH_PATTERN.exec(normalized);
  if (!match) {
    return null;
  }

  const [, customerId, enrollmentId, logDate, mealSlot, photoFileName] = match;
  if (!customerId || !enrollmentId || !logDate || !mealSlot || !photoFileName) {
    return null;
  }

  if (!isPrimaryMealSlotForImages(mealSlot)) {
    return null;
  }

  return {
    customerId,
    enrollmentId,
    logDate,
    mealSlot,
    photoId: photoFileName.replace(/\.jpg$/, ""),
  };
}

export type CoachingMealPhotoPathValidationResult =
  | { valid: true; parsed: ParsedCoachingMealPhotoPath }
  | { valid: false; reason: string };

export function validateCoachingMealPhotoPath(input: {
  storagePath: string;
  customerId: string;
  enrollmentId: string;
  logDate: string;
  mealSlot?: PrimaryMealSlot;
}): CoachingMealPhotoPathValidationResult {
  const parsed = parseCoachingMealPhotoPath(input.storagePath);
  if (!parsed) {
    return { valid: false, reason: "invalid_path_format" };
  }

  if (parsed.customerId !== input.customerId) {
    return { valid: false, reason: "customer_mismatch" };
  }
  if (parsed.enrollmentId !== input.enrollmentId) {
    return { valid: false, reason: "enrollment_mismatch" };
  }
  if (parsed.logDate !== input.logDate) {
    return { valid: false, reason: "log_date_mismatch" };
  }
  if (input.mealSlot && parsed.mealSlot !== input.mealSlot) {
    return { valid: false, reason: "meal_slot_mismatch" };
  }

  return { valid: true, parsed };
}

export function isAllowedCoachingMealPhotoSlot(mealSlot: CoachingMealSlot): boolean {
  return isPrimaryMealSlotForImages(mealSlot);
}
