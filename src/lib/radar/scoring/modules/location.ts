import { LOCATION_POINTS } from "../config";
import type { LocationAssessment } from "../types";

/** Location = development convenience only — not Candidate quality. */
export function computeLocationScore(assessment: LocationAssessment): number {
  return LOCATION_POINTS[assessment.level];
}
