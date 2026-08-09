import { ACTIVITY_FRESHNESS_POINTS } from "../config";
import type { ActivityAssessment } from "../types";

/** Activity measures freshness only — not volume, popularity, or influence. */
export function computeActivityScore(assessment: ActivityAssessment): number {
  const days = assessment.daysSinceLastMeaningfulActivity;
  if (days === null || days < 0) {
    return 0;
  }

  for (const band of ACTIVITY_FRESHNESS_POINTS) {
    if (days <= band.maxDays) {
      return band.points;
    }
  }

  return 0;
}
