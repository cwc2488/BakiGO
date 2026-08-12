import type { CoachingPlanSnapshot } from "@/types/coaching";
import type { CoachingMealPlanContext } from "@/types/coaching-signals";

export type { CoachingMealPlanContext };

const SHAKE_PLAN_PATTERN = /奶昔|蛋白飲|代餐|shake|meal\s*replacement/i;

function slotAllowsShake(lines: string[] | undefined): boolean {
  return (lines ?? []).some((line) => SHAKE_PLAN_PATTERN.test(line));
}

/**
 * Deterministic meal-slot shake allowance from enrollment plan_snapshot_json.
 * Never hardcodes breakfast/dinner as always-shake — reads dailyInstructions only.
 */
export function buildMealPlanContext(
  planSnapshot: CoachingPlanSnapshot | null | undefined,
): CoachingMealPlanContext {
  const instructions = planSnapshot?.dailyInstructions;
  return {
    breakfastAllowsShake: slotAllowsShake(instructions?.breakfast),
    lunchAllowsShake: slotAllowsShake(instructions?.lunch),
    dinnerAllowsShake: slotAllowsShake(instructions?.dinner),
  };
}

export function mealSlotAllowsShake(
  planContext: CoachingMealPlanContext,
  mealSlot: "breakfast" | "lunch" | "dinner",
): boolean {
  switch (mealSlot) {
    case "breakfast":
      return planContext.breakfastAllowsShake;
    case "lunch":
      return planContext.lunchAllowsShake;
    case "dinner":
      return planContext.dinnerAllowsShake;
  }
}
