import type { CoachingInterventionContext, CoachingRollingMemory } from "@/types/coaching-ai";

export function resolveCoachingInterventionContext(input?: {
  rollingMemory?: CoachingRollingMemory;
}): CoachingInterventionContext {
  void input;

  // V1: no full two-week intervention engine yet. Deterministic engine owns final level.
  return {
    finalInterventionLevel: "normal",
    reasons: [],
    provenance: "deterministic",
  };
}
