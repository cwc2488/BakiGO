import { CORE_TRAIT_MAX, TRAIT_LEVEL_TARGET_RATIO } from "../config";
import type {
  CoreTraitEvidenceInput,
  CoreTraitId,
  CoreTraitsScoreResult,
  CoreTraitScoreBreakdown,
  ProfileObservabilityInput,
  ProfileObservabilityLevel,
  TraitLevel,
  TraitObservability,
  TraitObservabilityDiagnosis,
} from "../types";
import {
  deduplicateTraitEvidence,
  enrichEvidenceEvent,
  getDirectionalEvents,
  isContradictoryEvent,
  isPositiveEvent,
} from "./evidence-utils";
import { computeEvidenceMean, rawLevelFromMean } from "./evidence-mean";
import { countAnalyzableItems } from "./profile-observability";
import { computeTraitConfidence } from "./trait-confidence";
import { resolveEffectiveTraitLevel } from "./trait-gates";

const ALL_TRAITS: CoreTraitId[] = [
  "consistency_resilience",
  "responsibility_commitment",
  "team_collaboration",
  "sharing_influence",
];

export function diagnoseTraitObservability(
  trait_id: CoreTraitId,
  effective_trait_level: TraitLevel,
  profileLevel: ProfileObservabilityLevel,
): TraitObservability {
  let diagnosis: TraitObservabilityDiagnosis;

  if (profileLevel === "low") {
    diagnosis =
      effective_trait_level === "insufficient"
        ? "insufficient_observation_opportunity"
        : "observation_limited_assessed";
  } else if (effective_trait_level === "insufficient") {
    diagnosis = "no_relevant_evidence_found";
  } else {
    diagnosis = "assessed";
  }

  return {
    trait_id,
    trait_observability_diagnosis: diagnosis,
    profile_observability_level: profileLevel,
  };
}

export function computeSingleTraitScore(
  input: CoreTraitEvidenceInput,
  referenceDate: Date,
): CoreTraitScoreBreakdown {
  const deduped = deduplicateTraitEvidence(input.evidence_events);
  const events = deduped.map((e) => enrichEvidenceEvent(e, referenceDate));
  const directional = getDirectionalEvents(events);

  const { evidence_mean, evidence_mean_numerator, evidence_mean_denominator } =
    computeEvidenceMean(events);
  const raw_trait_level = rawLevelFromMean(
    evidence_mean,
    directional.length > 0,
  );

  const gateResult = resolveEffectiveTraitLevel(
    raw_trait_level,
    events,
    evidence_mean,
  );

  const { confidence, components } = computeTraitConfidence(events);
  const trait_max = CORE_TRAIT_MAX[input.trait_id];
  const target_ratio =
    TRAIT_LEVEL_TARGET_RATIO[gateResult.effective_trait_level];

  const final_ratio =
    gateResult.effective_trait_level === "insufficient"
      ? TRAIT_LEVEL_TARGET_RATIO.insufficient
      : 0.5 + confidence * (target_ratio - 0.5);

  const final_trait_score = trait_max * final_ratio;

  const gateEligiblePositive = events.filter(
    (e) => e.gate_eligible && isPositiveEvent(e),
  );
  const gateEligibleContradictory = events.filter(
    (e) => e.gate_eligible && isContradictoryEvent(e),
  );

  return {
    trait_id: input.trait_id,
    trait_max,
    raw_trait_level,
    effective_trait_level: gateResult.effective_trait_level,
    evidence_mean,
    evidence_mean_numerator,
    evidence_mean_denominator,
    directional_evidence_event_count: directional.length,
    gate_eligible_positive_event_count: gateEligiblePositive.length,
    gate_eligible_direct_positive_event_count: gateEligiblePositive.filter(
      (e) => e.evidence_quality === "direct",
    ).length,
    gate_eligible_contradictory_event_count: gateEligibleContradictory.length,
    gate_eligible_direct_contradictory_event_count:
      gateEligibleContradictory.filter((e) => e.evidence_quality === "direct")
        .length,
    gate_eligible_positive_temporal_buckets: [
      ...new Set(gateEligiblePositive.map((e) => e.temporal_bucket)),
    ],
    gate_eligible_contradictory_temporal_buckets: [
      ...new Set(gateEligibleContradictory.map((e) => e.temporal_bucket)),
    ],
    negative_signal_present: gateResult.negative_signal_present,
    gate_reason: gateResult.gate_reason,
    target_ratio,
    confidence,
    confidence_components: components,
    final_ratio,
    final_trait_score,
    evidence_events: events,
  };
}

export function computeCoreTraitsScore(
  traits: CoreTraitEvidenceInput[],
  profileInput?: ProfileObservabilityInput,
  referenceDate: Date = new Date(),
): CoreTraitsScoreResult {
  const traitMap = new Map(traits.map((t) => [t.trait_id, t]));
  const trait_scores = ALL_TRAITS.map((trait_id) => {
    const input = traitMap.get(trait_id) ?? { trait_id, evidence_events: [] };
    return computeSingleTraitScore(input, referenceDate);
  });

  const core_traits_score = Math.min(
    5.0,
    trait_scores.reduce((sum, t) => sum + t.final_trait_score, 0),
  );

  const profile_observability = profileInput
    ? {
        ...countAnalyzableItems(profileInput.analyzableItems),
        data_completeness: profileInput.dataCompleteness,
      }
    : {
        analyzable_item_count: 0,
        excluded_repost_count: 0,
        excluded_duplicate_count: 0,
        excluded_empty_share_count: 0,
        excluded_no_expression_count: 0,
        excluded_unattributable_count: 0,
        profile_observability_level: "low" as const,
        data_completeness: undefined,
      };

  const trait_observability = trait_scores.map((t) =>
    diagnoseTraitObservability(
      t.trait_id,
      t.effective_trait_level,
      profile_observability.profile_observability_level,
    ),
  );

  return {
    trait_scores,
    core_traits_score,
    profile_observability,
    trait_observability,
  };
}
