import type { TemporalBucket, TraitEvidenceEvent, TraitLevel } from "../types";
import {
  isContradictoryEvent,
  isPositiveEvent,
  uniqueBuckets,
} from "./evidence-utils";

function countGateEligiblePositive(events: TraitEvidenceEvent[]): number {
  return events.filter((e) => e.gate_eligible && isPositiveEvent(e)).length;
}

function countGateEligibleDirectPositive(events: TraitEvidenceEvent[]): number {
  return events.filter(
    (e) => e.gate_eligible && isPositiveEvent(e) && e.evidence_quality === "direct",
  ).length;
}

function countSupporting(events: TraitEvidenceEvent[]): number {
  return events.filter(isPositiveEvent).length;
}

function gateEligiblePositiveBuckets(events: TraitEvidenceEvent[]): TemporalBucket[] {
  return uniqueBuckets(events.filter((e) => e.gate_eligible && isPositiveEvent(e)));
}

function moderateGate(events: TraitEvidenceEvent[]): boolean {
  return countSupporting(events) >= 1;
}

function strongGate(events: TraitEvidenceEvent[]): boolean {
  return countGateEligiblePositive(events) >= 2;
}

function veryStrongGate(
  events: TraitEvidenceEvent[],
  evidence_mean: number | null,
): boolean {
  if (evidence_mean === null || evidence_mean < 1.5) return false;
  if (countGateEligiblePositive(events) < 3) return false;
  if (gateEligiblePositiveBuckets(events).length < 2) return false;
  if (countGateEligibleDirectPositive(events) < 1) return false;
  return true;
}

function gateSatisfied(
  level: TraitLevel,
  events: TraitEvidenceEvent[],
  evidence_mean: number | null,
): boolean {
  switch (level) {
    case "moderate":
      return moderateGate(events);
    case "strong":
      return strongGate(events);
    case "very_strong":
      return veryStrongGate(events, evidence_mean);
    default:
      return true;
  }
}

const POSITIVE_LEVELS: TraitLevel[] = [
  "very_strong",
  "strong",
  "moderate",
  "insufficient",
];

function meanSupportsLevel(
  level: TraitLevel,
  evidence_mean: number | null,
): boolean {
  if (evidence_mean === null) return level === "insufficient";
  switch (level) {
    case "insufficient":
      return true;
    case "moderate":
      return evidence_mean >= 0;
    case "strong":
      return evidence_mean >= 0.75;
    case "very_strong":
      return evidence_mean >= 1.5;
    default:
      return false;
  }
}

/** Positive gate fallback — downgrade only, never upgrade. */
export function applyPositiveGateFallback(
  raw_trait_level: TraitLevel,
  events: TraitEvidenceEvent[],
  evidence_mean: number | null,
): { effective_trait_level: TraitLevel; gate_reason: string } {
  if (raw_trait_level === "weak" || raw_trait_level === "insufficient") {
    return { effective_trait_level: raw_trait_level, gate_reason: "within_bounds" };
  }

  const startIdx = POSITIVE_LEVELS.indexOf(raw_trait_level);
  if (startIdx === -1) {
    return { effective_trait_level: raw_trait_level, gate_reason: "within_bounds" };
  }

  for (let i = startIdx; i < POSITIVE_LEVELS.length; i++) {
    const candidate = POSITIVE_LEVELS[i];
    if (
      gateSatisfied(candidate, events, evidence_mean) &&
      meanSupportsLevel(candidate, evidence_mean)
    ) {
      const gate_reason =
        candidate === raw_trait_level
          ? "within_bounds"
          : `positive_gate:fallback_to_${candidate}`;
      return { effective_trait_level: candidate, gate_reason };
    }
  }

  return {
    effective_trait_level: "insufficient",
    gate_reason: "positive_gate:fallback_to_insufficient",
  };
}

function countGateEligibleContradictory(events: TraitEvidenceEvent[]): number {
  return events.filter((e) => e.gate_eligible && isContradictoryEvent(e)).length;
}

function countGateEligibleDirectContradictory(
  events: TraitEvidenceEvent[],
): number {
  return events.filter(
    (e) =>
      e.gate_eligible &&
      isContradictoryEvent(e) &&
      e.evidence_quality === "direct",
  ).length;
}

function gateEligibleContradictoryBuckets(
  events: TraitEvidenceEvent[],
): TemporalBucket[] {
  return uniqueBuckets(
    events.filter((e) => e.gate_eligible && isContradictoryEvent(e)),
  );
}

export function applyNegativeWeakGate(
  clamped_level: TraitLevel,
  events: TraitEvidenceEvent[],
  evidence_mean: number | null,
): {
  effective_trait_level: TraitLevel;
  negative_signal_present: boolean;
  gate_reason: string;
} {
  const hasContradictory = events.some(isContradictoryEvent);

  if (clamped_level !== "weak") {
    return {
      effective_trait_level: clamped_level,
      negative_signal_present: hasContradictory && clamped_level === "insufficient",
      gate_reason: "within_bounds",
    };
  }

  const weakGateOk =
    evidence_mean !== null &&
    evidence_mean < 0 &&
    countGateEligibleContradictory(events) >= 3 &&
    gateEligibleContradictoryBuckets(events).length >= 2 &&
    countGateEligibleDirectContradictory(events) >= 1;

  if (weakGateOk) {
    return {
      effective_trait_level: "weak",
      negative_signal_present: false,
      gate_reason: "within_bounds",
    };
  }

  let gate_reason = "negative_gate:gate_failed";
  if (countGateEligibleDirectContradictory(events) < 1) {
    gate_reason = "negative_gate:direct_required=0";
  } else if (countGateEligibleContradictory(events) < 3) {
    gate_reason = `negative_gate:gate_eligible_count=${countGateEligibleContradictory(events)}`;
  } else if (gateEligibleContradictoryBuckets(events).length < 2) {
    gate_reason = "negative_gate:gate_eligible_temporal_buckets=1";
  }

  return {
    effective_trait_level: "insufficient",
    negative_signal_present: true,
    gate_reason,
  };
}

export function resolveEffectiveTraitLevel(
  raw_trait_level: TraitLevel,
  events: TraitEvidenceEvent[],
  evidence_mean: number | null,
): {
  effective_trait_level: TraitLevel;
  negative_signal_present: boolean;
  gate_reason: string;
} {
  const positive = applyPositiveGateFallback(
    raw_trait_level,
    events,
    evidence_mean,
  );
  const negative = applyNegativeWeakGate(
    positive.effective_trait_level,
    events,
    evidence_mean,
  );

  return {
    effective_trait_level: negative.effective_trait_level,
    negative_signal_present: negative.negative_signal_present,
    gate_reason:
      negative.gate_reason !== "within_bounds"
        ? negative.gate_reason
        : positive.gate_reason,
  };
}
