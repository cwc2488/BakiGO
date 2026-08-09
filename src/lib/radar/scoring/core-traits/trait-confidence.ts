import {
  CONFIDENCE_WEIGHTS,
  CONTRADICTION_CONSISTENCY_MAP,
  CROSS_CONTEXT_COVERAGE,
  TEMPORAL_BUCKET_COVERAGE,
} from "../config";
import type {
  ContradictionStrength,
  CoreTraitConfidenceComponents,
  TraitEvidenceEvent,
} from "../types";
import {
  getDirectionalEvents,
  isContradictoryEvent,
  isGateEligibleQuality,
  isPositiveEvent,
  uniqueBuckets,
} from "./evidence-utils";

export function computeEvidenceVolume(
  events: TraitEvidenceEvent[],
): { weighted_evidence_count: number; evidence_volume: number } {
  const directional = getDirectionalEvents(events);
  const weighted_evidence_count = directional.reduce(
    (sum, e) => sum + e.quality_multiplier,
    0,
  );
  return {
    weighted_evidence_count,
    evidence_volume: Math.min(weighted_evidence_count / 4.0, 1.0),
  };
}

export function computeTemporalCoverage(
  events: TraitEvidenceEvent[],
): number {
  const qualifying = getDirectionalEvents(events).filter(
    (e) => e.gate_eligible,
  );
  const bucketCount = uniqueBuckets(qualifying).length;
  const key = Math.min(bucketCount, 3) as 0 | 1 | 2 | 3;
  return TEMPORAL_BUCKET_COVERAGE[key];
}

export function computeCrossContextConsistency(
  events: TraitEvidenceEvent[],
): number {
  const qualifying = getDirectionalEvents(events).filter((e) =>
    isGateEligibleQuality(e.evidence_quality),
  );
  const contexts = new Set<string>();
  for (const event of qualifying) {
    for (const ctx of event.context_categories) {
      contexts.add(ctx);
    }
  }
  const count = Math.min(contexts.size, 3);
  return CROSS_CONTEXT_COVERAGE[count as 0 | 1 | 2 | 3];
}

function contradictionImpact(event: TraitEvidenceEvent): number {
  return Math.abs(event.base_evidence_value) * event.quality_multiplier;
}

export function deriveContradictionStrength(
  events: TraitEvidenceEvent[],
): ContradictionStrength {
  const directional = getDirectionalEvents(events);
  const gateEligible = directional.filter((e) => e.gate_eligible);

  if (gateEligible.length < 2) {
    return "insufficient";
  }

  const contradictory = directional.filter(isContradictoryEvent);
  if (contradictory.length === 0) {
    return "none";
  }

  const weightedContradiction = contradictory.reduce(
    (sum, e) => sum + contradictionImpact(e),
    0,
  );
  const weightedPositive = directional
    .filter(isPositiveEvent)
    .reduce((sum, e) => sum + Math.abs(e.effective_evidence_value), 0);

  const hasDirectContradictory = contradictory.some(
    (e) => e.evidence_quality === "direct",
  );
  const hasDirectStrongContradictory = contradictory.some(
    (e) =>
      e.evidence_quality === "direct" &&
      e.evidence_strength === "contradictory_strong",
  );

  if (hasDirectStrongContradictory && weightedContradiction >= 1.5) {
    return "strong";
  }

  if (hasDirectContradictory && weightedContradiction >= 1.0) {
    return "moderate";
  }

  const totalWeight = weightedContradiction + weightedPositive;
  const ratio = totalWeight > 0 ? weightedContradiction / totalWeight : 0;

  if (ratio >= 0.5 && hasDirectContradictory) {
    return "moderate";
  }
  if (ratio >= 0.2 || weightedContradiction >= 0.5) {
    return "weak";
  }

  return contradictory.every((e) => e.evidence_quality === "ambiguous")
    ? "weak"
    : "none";
}

export function computeContradictionConsistency(
  events: TraitEvidenceEvent[],
): number {
  const strength = deriveContradictionStrength(events);
  return CONTRADICTION_CONSISTENCY_MAP[strength];
}

export function computeTraitConfidence(
  events: TraitEvidenceEvent[],
): {
  confidence: number;
  components: CoreTraitConfidenceComponents;
} {
  const { evidence_volume } = computeEvidenceVolume(events);
  const temporal_coverage = computeTemporalCoverage(events);
  const cross_context_consistency = computeCrossContextConsistency(events);
  const contradiction_consistency = computeContradictionConsistency(events);

  const confidence =
    CONFIDENCE_WEIGHTS.temporal_coverage * temporal_coverage +
    CONFIDENCE_WEIGHTS.contradiction_consistency * contradiction_consistency +
    CONFIDENCE_WEIGHTS.cross_context_consistency * cross_context_consistency +
    CONFIDENCE_WEIGHTS.evidence_volume * evidence_volume;

  return {
    confidence: Math.max(0, Math.min(1, confidence)),
    components: {
      evidence_volume,
      temporal_coverage,
      cross_context_consistency,
      contradiction_consistency,
    },
  };
}
