import { clampPercent } from "@/lib/business-engine/utils";

/**
 * Score from engine-computed progress only — no hardcoded thresholds.
 * Higher score = closer to completion = higher decision urgency.
 */
export function scoreFromProgress(
  progressPercent: number | null,
  remaining: number,
  target: number,
): number {
  if (progressPercent !== null && !Number.isNaN(progressPercent)) {
    return clampPercent(progressPercent);
  }

  if (target > 0) {
    return clampPercent(((target - remaining) / target) * 100);
  }

  return 0;
}

export function sortCandidates<T extends { score: number; enginePriority: number; remaining: number }>(
  candidates: T[],
): T[] {
  return [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (left.remaining !== right.remaining) {
      return left.remaining - right.remaining;
    }
    return right.enginePriority - left.enginePriority;
  });
}
