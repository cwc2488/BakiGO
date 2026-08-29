import type { Go21ExtractedEvent } from "@/types/go21";
import {
  upsertCoachingDailyLog,
  getCoachingDailyLogDetail,
  type ResolvedCoachingPortal,
} from "@/lib/coaching/coaching-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import type { CoachingMealSlot } from "@/types/coaching";
import { applyGo21Corrections } from "@/lib/go21/corrections";
import { upsertBodyRecordFromChat } from "@/lib/go21/body-record";

export type ApplyGo21StructuredResult = {
  dailyLogUpdated: boolean;
  bodyRecordCreated: boolean;
  bodyRecordUpdated: boolean;
  logDate: string | null;
  correctionApplied: boolean;
  errors: string[];
};

/**
 * Apply extracted structured events onto canonical coaching / body tables.
 * Never invents meal_slot when unresolved. Never fabricates waterMl from qualitative text.
 * Same-day upserts are idempotent (retry-safe).
 */
export async function applyGo21StructuredEvent(input: {
  portal: ResolvedCoachingPortal;
  extracted: Go21ExtractedEvent;
  rawMessage: string;
}): Promise<ApplyGo21StructuredResult> {
  const extracted = input.extracted;
  const errors: string[] = [];
  let dailyLogUpdated = false;
  let bodyRecordCreated = false;
  let bodyRecordUpdated = false;
  let correctionApplied = false;

  if (extracted.corrections.length > 0) {
    const corr = await applyGo21Corrections({
      portal: input.portal,
      extracted,
      messageLogDate: extracted.eventDate ?? coachingTodayLogDate(),
    });
    correctionApplied = corr.applied;
    errors.push(...corr.errors);
  }

  const logDate = extracted.eventDate ?? coachingTodayLogDate();

  const meals: Partial<Record<CoachingMealSlot, { textNote?: string | null }>> = {};
  if (extracted.mealSlot && extracted.mealNote) {
    meals[extracted.mealSlot] = { textNote: extracted.mealNote };
  }

  const hydrationNoteParts: string[] = [];
  if (extracted.hydrationNote) hydrationNoteParts.push(extracted.hydrationNote);
  if (extracted.hydrationQuality === "low") hydrationNoteParts.push("喝水偏少");
  if (extracted.hydrationQuality === "high") hydrationNoteParts.push("喝水偏多");

  const shouldTouchDaily =
    Object.keys(meals).length > 0 ||
    extracted.waterMl != null ||
    Boolean(extracted.exerciseNote) ||
    extracted.hungerMentioned ||
    hydrationNoteParts.length > 0 ||
    Boolean(extracted.mealNote && !extracted.mealSlot);

  if (shouldTouchDaily) {
    try {
      const existing = await getCoachingDailyLogDetail({
        enrollmentId: input.portal.enrollmentId,
        logDate,
      });
      const customerNoteParts = [existing.customerNote?.trim() || null];
      if (extracted.hungerMentioned) customerNoteParts.push("提到容易餓");
      if (!extracted.mealSlot && extracted.mealNote) {
        customerNoteParts.push(extracted.mealNote);
      }
      for (const part of hydrationNoteParts) {
        if (!customerNoteParts.some((p) => p?.includes(part))) {
          customerNoteParts.push(part);
        }
      }
      if (extracted.unresolvedQuestions.includes("meal_slot_unknown")) {
        customerNoteParts.push("（照片待確認餐別）");
      }

      await upsertCoachingDailyLog({
        portal: input.portal,
        logDate,
        meals: Object.keys(meals).length > 0 ? meals : undefined,
        waterMl: extracted.waterMl ?? undefined,
        exerciseNote: extracted.exerciseNote ?? undefined,
        customerNote: customerNoteParts.filter(Boolean).join("；") || undefined,
        markSubmitted: false,
      });
      dailyLogUpdated = true;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "daily_log_write_failed");
    }
  }

  if (
    extracted.weightKg != null ||
    extracted.bodyFatPercent != null ||
    extracted.skeletalMuscleKg != null ||
    extracted.visceralFatLevel != null ||
    extracted.basalMetabolicRate != null
  ) {
    const body = await upsertBodyRecordFromChat({
      customerId: input.portal.customerId,
      ownerMemberId: input.portal.ownerMemberId,
      recordDate: logDate,
      weightKg: extracted.weightKg,
      bodyFatPercent: extracted.bodyFatPercent,
      skeletalMuscleKg: extracted.skeletalMuscleKg,
      visceralFatLevel: extracted.visceralFatLevel,
      basalMetabolicRate: extracted.basalMetabolicRate,
    });
    bodyRecordCreated = body.created;
    bodyRecordUpdated = body.updated;
    if (body.error) errors.push(body.error);
  }

  void input.rawMessage;
  return {
    dailyLogUpdated,
    bodyRecordCreated,
    bodyRecordUpdated,
    logDate,
    correctionApplied,
    errors,
  };
}
