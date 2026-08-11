import {
  COACHING_AI_MAX_IMAGES_PER_MEAL,
  COACHING_AI_MAX_MEAL_IMAGES_PER_DAY,
} from "@/lib/coaching/ai/coaching-meal-photo-constants";
import { isAllowedCoachingMealPhotoSlot } from "@/lib/coaching/ai/validate-coaching-meal-photo-path";
import type { CoachingGenerationMealPhotoRef } from "@/types/coaching-ai";
import { PRIMARY_MEAL_SLOTS, type CoachingDailyLogDetail, type PrimaryMealSlot } from "@/types/coaching";

export type CoachingMealPhotoCandidate = {
  mealSlot: PrimaryMealSlot;
  storagePath: string;
  uploadedAt: string;
};

export type CoachingMealPhotoSelection = {
  mealSlot: PrimaryMealSlot;
  storagePath: string | null;
  uploadedAt: string | null;
};

export function extractCoachingMealPhotoCandidates(todayLog: CoachingDailyLogDetail): CoachingMealPhotoCandidate[] {
  const candidates: CoachingMealPhotoCandidate[] = [];

  for (const meal of todayLog.meals) {
    if (!isAllowedCoachingMealPhotoSlot(meal.mealSlot)) {
      continue;
    }
    if (!meal.photo?.storagePath) {
      continue;
    }

    candidates.push({
      mealSlot: meal.mealSlot as PrimaryMealSlot,
      storagePath: meal.photo.storagePath,
      uploadedAt: meal.photo.uploadedAt ?? meal.photo.createdAt,
    });
  }

  return candidates;
}

/** Deterministic: at most one photo per primary meal — latest successful upload wins. */
export function selectCoachingPhotosForGeneration(
  candidates: CoachingMealPhotoCandidate[],
): CoachingMealPhotoSelection[] {
  const grouped = new Map<PrimaryMealSlot, CoachingMealPhotoCandidate[]>(
    PRIMARY_MEAL_SLOTS.map((slot) => [slot, []]),
  );

  for (const candidate of candidates) {
    if (!PRIMARY_MEAL_SLOTS.includes(candidate.mealSlot)) {
      continue;
    }
    grouped.get(candidate.mealSlot)?.push(candidate);
  }

  const selections = PRIMARY_MEAL_SLOTS.map((mealSlot) => {
    const slotCandidates = grouped.get(mealSlot) ?? [];
    const sorted = slotCandidates
      .slice()
      .sort((left, right) => {
        const uploadedCompare = right.uploadedAt.localeCompare(left.uploadedAt);
        if (uploadedCompare !== 0) {
          return uploadedCompare;
        }
        return right.storagePath.localeCompare(left.storagePath);
      });

    const selected = sorted[0] ?? null;
    return {
      mealSlot,
      storagePath: selected?.storagePath ?? null,
      uploadedAt: selected?.uploadedAt ?? null,
    };
  });

  const selectedCount = selections.filter((item) => item.storagePath).length;
  if (selectedCount > COACHING_AI_MAX_MEAL_IMAGES_PER_DAY) {
    throw new Error(`Selected meal photo count exceeds daily limit (${COACHING_AI_MAX_MEAL_IMAGES_PER_DAY})`);
  }

  for (const selection of selections) {
    const slotCount = candidates.filter(
      (candidate) => candidate.mealSlot === selection.mealSlot && candidate.storagePath === selection.storagePath,
    ).length;
    if (slotCount > COACHING_AI_MAX_IMAGES_PER_MEAL && selection.storagePath) {
      // Multiple candidates collapse to one selected path — enforced by selector output shape.
      void slotCount;
    }
  }

  return selections;
}

export function buildGenerationMealPhotoRefs(input: {
  todayLog: CoachingDailyLogDetail;
  candidates?: CoachingMealPhotoCandidate[];
}): CoachingGenerationMealPhotoRef[] {
  const candidates = input.candidates ?? extractCoachingMealPhotoCandidates(input.todayLog);
  const selections = selectCoachingPhotosForGeneration(candidates);

  return selections.map((selection) => {
    const meal = input.todayLog.meals.find((entry) => entry.mealSlot === selection.mealSlot) ?? null;
    return {
      mealSlot: selection.mealSlot,
      storagePath: selection.storagePath,
      textNote: meal?.textNote?.trim() || null,
    };
  });
}

export function countSelectedCoachingMealPhotos(selections: CoachingMealPhotoSelection[]): number {
  return selections.filter((item) => item.storagePath).length;
}
