/**
 * Fast Layer-1 for submit critical path.
 * Uses today daily log + one lightweight directive query only.
 * No historical logs, no Growth/Attention, no AI context.
 */

import {
  buildImmediateDailyFeedback,
  buildImmediateDirectiveSignalsFromMeals,
  type ImmediateDailyFeedback,
} from "@/lib/coaching/immediate-daily-feedback";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { CoachingDailyLogDetail } from "@/types/coaching";
import type { StructuredCoachDirective } from "@/lib/coaching/directive-meal-verification";

async function loadActiveCustomerDirectivesFast(input: {
  enrollmentId: string;
  logDate: string;
}): Promise<StructuredCoachDirective[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_directives")
    .select(
      "id, meal_slot, coach_instruction, current_focus, effective_from, effective_until, status, customer_visible",
    )
    .eq("enrollment_id", input.enrollmentId)
    .eq("status", "active")
    .eq("customer_visible", true)
    .limit(20);

  if (error || !data) {
    return [];
  }

  const directives: StructuredCoachDirective[] = [];
  for (const row of data) {
    const instruction =
      (row.coach_instruction != null ? String(row.coach_instruction).trim() : "") ||
      (row.current_focus != null ? String(row.current_focus).trim() : "");
    if (!instruction) continue;
    const mealSlotRaw = row.meal_slot != null ? String(row.meal_slot) : "general";
    const mealSlot =
      mealSlotRaw === "breakfast" ||
      mealSlotRaw === "lunch" ||
      mealSlotRaw === "dinner" ||
      mealSlotRaw === "snack" ||
      mealSlotRaw === "general"
        ? mealSlotRaw
        : "general";
    const effectiveFrom = String(row.effective_from ?? input.logDate).slice(0, 10);
    const effectiveUntil =
      row.effective_until != null ? String(row.effective_until).slice(0, 10) : null;
    if (input.logDate < effectiveFrom) continue;
    if (effectiveUntil && input.logDate > effectiveUntil) continue;
    directives.push({
      id: String(row.id),
      mealSlot,
      instructionText: instruction,
      effectiveFrom,
      effectiveUntil,
      status: "active",
      customerVisible: true,
    });
  }
  return directives;
}

/**
 * Submit-critical Layer 1 — intentionally omits historical bowel trend loads.
 * Elevated-today bowel still works from today's count via assessBowelMovementSignal.
 */
export async function loadImmediateDailyFeedbackForSubmit(input: {
  enrollmentId: string;
  logDate: string;
  dailyLog: CoachingDailyLogDetail;
}): Promise<ImmediateDailyFeedback> {
  const directives = await loadActiveCustomerDirectivesFast({
    enrollmentId: input.enrollmentId,
    logDate: input.logDate,
  }).catch(() => [] as StructuredCoachDirective[]);

  const directiveSignals = buildImmediateDirectiveSignalsFromMeals({
    meals: input.dailyLog.meals,
    directives: directives.map((directive) => ({
      mealSlot: directive.mealSlot,
      instructionText: directive.instructionText,
    })),
  });

  return buildImmediateDailyFeedback({
    dailyLog: input.dailyLog,
    recentBowelCounts: [],
    directiveSignals,
  });
}
