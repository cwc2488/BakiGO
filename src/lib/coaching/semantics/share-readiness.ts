import type { ShareReadinessState } from "@/lib/coaching/semantics/types";

export function resolveShareReadiness(input: {
  measurementStage?: string | null;
  outcomeStatus?: string | null;
  suitableNow?: boolean;
  readiness?: string | null;
  repairExperience?: boolean;
  inviteCheckin?: boolean;
}): ShareReadinessState {
  const stage = input.measurementStage ?? "";
  const outcome = input.outcomeStatus ?? "";
  const insufficient =
    stage === "baseline_only" ||
    outcome === "not_yet_measurable" ||
    outcome === "insufficient_data" ||
    outcome === "baseline_only";

  if (insufficient) return "NOT_ENOUGH_DATA";
  if (input.suitableNow || input.readiness === "strong") return "READY";
  if (input.readiness === "emerging" || input.inviteCheckin || input.repairExperience) {
    return "POSSIBLE_SIGNAL";
  }
  if (input.readiness === "not_ready") return "NOT_READY";
  return "NOT_ENOUGH_DATA";
}

export function shareReadinessCopy(state: ShareReadinessState): string {
  switch (state) {
    case "READY":
      return "現在適合談";
    case "POSSIBLE_SIGNAL":
      return "可能有成果訊號，先觀察再決定";
    case "NOT_READY":
      return "現在還不適合談";
    default:
      return "資料還不足，等待下一次量測";
  }
}
