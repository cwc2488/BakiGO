import { EVIDENCE_QUALITY_MULTIPLIER, EVIDENCE_STRENGTH_BASE } from "../config";
import type {
  EvidenceQuality,
  EvidenceStrength,
  TemporalBucket,
  TraitEvidenceEvent,
  TraitEvidenceEventInput,
} from "../types";

const DIRECTIONAL: EvidenceStrength[] = [
  "positive_strong",
  "positive",
  "contradictory",
  "contradictory_strong",
];

export function isDirectionalStrength(strength: EvidenceStrength): boolean {
  return DIRECTIONAL.includes(strength);
}

export function isGateEligibleQuality(quality: EvidenceQuality): boolean {
  return quality === "direct" || quality === "contextual";
}

export function enrichEvidenceEvent(
  event: TraitEvidenceEventInput,
  referenceDate: Date,
): TraitEvidenceEvent {
  const base = EVIDENCE_STRENGTH_BASE[event.evidence_strength];
  const multiplier = EVIDENCE_QUALITY_MULTIPLIER[event.evidence_quality];

  return {
    ...event,
    base_evidence_value: base,
    quality_multiplier: multiplier,
    effective_evidence_value: base * multiplier,
    gate_eligible: isGateEligibleQuality(event.evidence_quality),
    temporal_bucket: resolveTemporalBucket(event.event_timestamp, referenceDate),
  };
}

export function resolveTemporalBucket(
  eventTimestamp: string,
  referenceDate: Date,
): TemporalBucket {
  const eventDate = new Date(eventTimestamp);
  const diffMs = referenceDate.getTime() - eventDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 30) return "recent";
  if (diffDays <= 60) return "mid";
  return "older";
}

/** Within-trait dedup: one event per event_id. Cross-trait reuse is caller responsibility. */
export function deduplicateTraitEvidence(
  events: TraitEvidenceEventInput[],
): TraitEvidenceEventInput[] {
  const seen = new Map<string, TraitEvidenceEventInput>();
  for (const event of events) {
    if (!seen.has(event.event_id)) {
      seen.set(event.event_id, event);
    }
  }
  return [...seen.values()];
}

export function getDirectionalEvents(events: TraitEvidenceEvent[]): TraitEvidenceEvent[] {
  return events.filter((e) => isDirectionalStrength(e.evidence_strength));
}

export function isPositiveEvent(event: TraitEvidenceEvent): boolean {
  return (
    event.evidence_strength === "positive" ||
    event.evidence_strength === "positive_strong"
  );
}

export function isContradictoryEvent(event: TraitEvidenceEvent): boolean {
  return (
    event.evidence_strength === "contradictory" ||
    event.evidence_strength === "contradictory_strong"
  );
}

export function uniqueBuckets(
  events: TraitEvidenceEvent[],
): TemporalBucket[] {
  return [...new Set(events.map((e) => e.temporal_bucket))];
}
