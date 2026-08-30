import { compactGo21GoalForAi, parseGo21GoalRecord } from "@/lib/go21/goal";
import type { Go21GoalRecord } from "@/types/go21";

export type Go21CoachGenerationContext = {
  /** Compact payload passed into V2/V3 generation. */
  go21Goal: NonNullable<ReturnType<typeof compactGo21GoalForAi>> | null;
  currentPersonalGoal: string | null;
  currentPrimaryDirection: string | null;
  originalPersonalGoal: string | null;
  wasRefined: boolean;
  targetWeightKg: number | null;
  /** True when a structured goal reached the generation path. */
  goalReachedGenerationContext: boolean;
};

/**
 * Authoritative Goal → generation context.
 * Testable without calling OpenAI. Refined current wins; original stays historical.
 */
export function buildGo21CoachGenerationContext(input: {
  go21GoalJson?: unknown;
  goalRecord?: Go21GoalRecord | null;
}): Go21CoachGenerationContext {
  const record =
    input.goalRecord ?? parseGo21GoalRecord(input.go21GoalJson) ?? null;
  const compact = compactGo21GoalForAi(record);
  if (!compact) {
    return {
      go21Goal: null,
      currentPersonalGoal: null,
      currentPrimaryDirection: null,
      originalPersonalGoal: null,
      wasRefined: false,
      targetWeightKg: null,
      goalReachedGenerationContext: false,
    };
  }
  return {
    go21Goal: compact,
    currentPersonalGoal: compact.personalGoal,
    currentPrimaryDirection: compact.primaryDirection,
    originalPersonalGoal: compact.originalPersonalGoal,
    wasRefined: compact.wasRefined,
    targetWeightKg: compact.targetWeightKg,
    goalReachedGenerationContext: true,
  };
}

/** Near-bottom detection for chat auto-follow (mobile-friendly threshold). */
export function isChatNearBottom(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  thresholdPx?: number;
}): boolean {
  // Slightly generous for mobile keyboard / rubber-band scroll.
  const threshold = input.thresholdPx ?? 120;
  return input.scrollHeight - input.scrollTop - input.clientHeight <= threshold;
}
