import { COACHING_MEAL_SLOTS, type CoachingMealSlot } from "@/types/coaching";

export function isCoachingMealSlot(value: string): value is CoachingMealSlot {
  return (COACHING_MEAL_SLOTS as readonly string[]).includes(value);
}

export function toCoachingApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
