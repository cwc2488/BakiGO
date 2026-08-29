import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { Go21ExtractedEvent } from "@/types/go21";
import {
  upsertCoachingDailyLog,
  getCoachingDailyLogDetail,
  type ResolvedCoachingPortal,
} from "@/lib/coaching/coaching-service";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import type { CoachingMealSlot } from "@/types/coaching";

/**
 * Apply extracted structured events onto canonical coaching / body tables.
 * Never invents meal_slot when unresolved.
 */
export async function applyGo21StructuredEvent(input: {
  portal: ResolvedCoachingPortal;
  extracted: Go21ExtractedEvent;
  rawMessage: string;
}): Promise<{
  dailyLogUpdated: boolean;
  bodyRecordCreated: boolean;
  logDate: string | null;
}> {
  const extracted = input.extracted;
  const logDate = extracted.eventDate ?? coachingTodayLogDate();
  let dailyLogUpdated = false;
  let bodyRecordCreated = false;

  const meals: Partial<Record<CoachingMealSlot, { textNote?: string | null }>> = {};
  if (extracted.mealSlot && extracted.mealNote) {
    meals[extracted.mealSlot] = { textNote: extracted.mealNote };
  }

  const shouldTouchDaily =
    Object.keys(meals).length > 0 ||
    extracted.waterMl != null ||
    Boolean(extracted.exerciseNote) ||
    extracted.hungerMentioned ||
    Boolean(extracted.mealNote && !extracted.mealSlot);

  if (shouldTouchDaily) {
    const existing = await getCoachingDailyLogDetail({
      enrollmentId: input.portal.enrollmentId,
      logDate,
    });
    const customerNoteParts = [existing.customerNote?.trim() || null];
    if (extracted.hungerMentioned) customerNoteParts.push("提到容易餓");
    if (!extracted.mealSlot && extracted.mealNote) {
      customerNoteParts.push(extracted.mealNote);
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
  }

  if (
    extracted.weightKg != null ||
    extracted.bodyFatPercent != null ||
    extracted.skeletalMuscleKg != null ||
    extracted.visceralFatLevel != null ||
    extracted.basalMetabolicRate != null
  ) {
    bodyRecordCreated = await upsertBodyRecordFromChat({
      customerId: input.portal.customerId,
      ownerMemberId: input.portal.ownerMemberId,
      recordDate: logDate,
      weightKg: extracted.weightKg,
      bodyFatPercent: extracted.bodyFatPercent,
      skeletalMuscleKg: extracted.skeletalMuscleKg,
      visceralFatLevel: extracted.visceralFatLevel,
      basalMetabolicRate: extracted.basalMetabolicRate,
    });
  }

  void input.rawMessage;
  return { dailyLogUpdated, bodyRecordCreated, logDate };
}

async function upsertBodyRecordFromChat(input: {
  customerId: string;
  ownerMemberId: string;
  recordDate: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  skeletalMuscleKg: number | null;
  visceralFatLevel: number | null;
  basalMetabolicRate: number | null;
}): Promise<boolean> {
  const supabase = createSupabaseServiceClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId)
    .maybeSingle();
  if (!customer) return false;

  const { data: existing } = await supabase
    .from("body_composition_records")
    .select("id, weight_kg, body_fat_percent, skeletal_muscle_kg, visceral_fat_level, basal_metabolic_rate")
    .eq("customer_id", input.customerId)
    .eq("record_date", input.recordDate)
    .maybeSingle();

  const payload = {
    weight_kg: input.weightKg ?? existing?.weight_kg ?? null,
    body_fat_percent: input.bodyFatPercent ?? existing?.body_fat_percent ?? null,
    skeletal_muscle_kg: input.skeletalMuscleKg ?? existing?.skeletal_muscle_kg ?? null,
    visceral_fat_level: input.visceralFatLevel ?? existing?.visceral_fat_level ?? null,
    basal_metabolic_rate: input.basalMetabolicRate ?? existing?.basal_metabolic_rate ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabase.from("body_composition_records").update(payload).eq("id", existing.id);
    return true;
  }

  await supabase.from("body_composition_records").insert({
    id: crypto.randomUUID(),
    customer_id: input.customerId,
    record_date: input.recordDate,
    ...payload,
    created_at: new Date().toISOString(),
  });
  return true;
}
