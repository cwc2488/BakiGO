import type { TraitEvidenceEvent, TraitLevel } from "../types";
import { getDirectionalEvents } from "./evidence-utils";

export function computeEvidenceMean(events: TraitEvidenceEvent[]): {
  evidence_mean: number | null;
  evidence_mean_numerator: number;
  evidence_mean_denominator: number;
} {
  const directional = getDirectionalEvents(events);
  if (directional.length === 0) {
    return {
      evidence_mean: null,
      evidence_mean_numerator: 0,
      evidence_mean_denominator: 0,
    };
  }

  const evidence_mean_numerator = directional.reduce(
    (sum, e) => sum + e.effective_evidence_value,
    0,
  );
  const evidence_mean_denominator = directional.reduce(
    (sum, e) => sum + e.quality_multiplier,
    0,
  );

  const evidence_mean =
    evidence_mean_denominator === 0
      ? null
      : evidence_mean_numerator / evidence_mean_denominator;

  return { evidence_mean, evidence_mean_numerator, evidence_mean_denominator };
}

export function rawLevelFromMean(
  evidence_mean: number | null,
  hasDirectional: boolean,
): TraitLevel {
  if (!hasDirectional || evidence_mean === null) {
    return "insufficient";
  }
  if (evidence_mean < 0) return "weak";
  if (evidence_mean < 0.75) return "moderate";
  if (evidence_mean < 1.5) return "strong";
  return "very_strong";
}
