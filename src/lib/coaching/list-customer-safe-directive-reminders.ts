import { customerSafeDirectiveLines, type StructuredCoachDirective } from "@/lib/coaching/directive-meal-verification";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";

/**
 * Customer-portal reminders only — customer_visible + active on logDate.
 * Never returns coach notes, reason codes, or Attention internals.
 */
export async function listCustomerSafeDirectiveReminders(input: {
  enrollmentId: string;
  logDate: string;
}): Promise<string[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_coach_directives")
    .select(
      "id, meal_slot, coach_instruction, current_focus, effective_from, effective_until, status, customer_visible",
    )
    .eq("enrollment_id", input.enrollmentId)
    .eq("status", "active")
    .eq("customer_visible", true);

  if (error) {
    if (error.code === "PGRST205" || error.message.includes("does not exist")) {
      return [];
    }
    // Soft-fail for portal — Home still renders without reminders.
    return [];
  }

  const directives: StructuredCoachDirective[] = [];
  for (const row of data ?? []) {
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
    directives.push({
      id: String(row.id),
      mealSlot,
      instructionText: instruction,
      effectiveFrom: String(row.effective_from ?? input.logDate).slice(0, 10),
      effectiveUntil: row.effective_until != null ? String(row.effective_until).slice(0, 10) : null,
      status: "active",
      customerVisible: true,
    });
  }

  return customerSafeDirectiveLines(directives, input.logDate);
}
