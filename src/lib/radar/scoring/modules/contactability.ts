import {
  CONTACTABILITY_SUBCAPS,
  INTERACTION_OPENNESS_POINTS,
  NATURAL_ENTRY_POINTS,
} from "../config";
import type { ContactabilityAssessment } from "../types";

export function computeContactabilityScore(
  assessment: ContactabilityAssessment,
): {
  contactability_score: number;
  natural_entry_score: number;
  interaction_openness_score: number;
} {
  const natural_entry_score = NATURAL_ENTRY_POINTS[assessment.naturalEntry];
  const interaction_openness_score =
    INTERACTION_OPENNESS_POINTS[assessment.interactionOpenness];

  return {
    natural_entry_score,
    interaction_openness_score,
    contactability_score: natural_entry_score + interaction_openness_score,
  };
}

export function assertContactabilityCaps(scores: {
  natural_entry_score: number;
  interaction_openness_score: number;
}): void {
  if (scores.natural_entry_score > CONTACTABILITY_SUBCAPS.naturalEntry) {
    throw new Error("natural_entry_score exceeds cap");
  }
  if (
    scores.interaction_openness_score >
    CONTACTABILITY_SUBCAPS.interactionOpenness
  ) {
    throw new Error("interaction_openness_score exceeds cap");
  }
}
