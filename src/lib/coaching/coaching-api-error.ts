import { COACHING_MEAL_SLOTS, type CoachingMealSlot } from "@/types/coaching";

export function isCoachingMealSlot(value: string): value is CoachingMealSlot {
  return (COACHING_MEAL_SLOTS as readonly string[]).includes(value);
}

const TECHNICAL_DB_MESSAGE =
  /on conflict|exclusion constraint|unique constraint|duplicate key|PGRST\d+|postgres|violates|permission denied for|relation .* does not exist|column .* does not exist|failed to save daily log|JWT|service role/i;

/**
 * Returns a client-safe message. Raw Postgres / PostgREST diagnostics must never
 * reach the customer portal — callers should still log the original error.
 */
export function toCoachingApiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }
  if (TECHNICAL_DB_MESSAGE.test(error.message)) {
    return fallback;
  }
  return error.message;
}
