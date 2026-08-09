import type { AI_RADAR_SCORING_VERSION } from "./config";

export type ScoringVersion = typeof AI_RADAR_SCORING_VERSION;

export type ChangeIntentLevel = "none" | "emerging" | "clear" | "strong";
export type BehavioralChangeLevel =
  | "none"
  | "exploring"
  | "trying"
  | "committed_action";
export type SolutionGapLevel = "closed" | "small" | "open" | "active_gap";

export type NeedStrengthLevel = "none" | "emerging" | "clear" | "strong";
export type NeedRelevanceLevel =
  | "unrelated"
  | "adjacent"
  | "relevant"
  | "high_fit";

export type NaturalEntryLevel =
  | "none"
  | "generic"
  | "relevant"
  | "high_leverage";
export type InteractionOpennessLevel =
  | "low"
  | "limited"
  | "open"
  | "highly_open";

export type LocationLevel =
  | "same_district"
  | "same_city"
  | "nearby_city"
  | "far"
  | "unknown"
  | "member_context_neutral";

export type CoreTraitId =
  | "consistency_resilience"
  | "responsibility_commitment"
  | "team_collaboration"
  | "sharing_influence";

export type EvidenceStrength =
  | "positive_strong"
  | "positive"
  | "neutral"
  | "contradictory"
  | "contradictory_strong";

export type EvidenceQuality = "direct" | "contextual" | "ambiguous";

export type TraitLevel =
  | "insufficient"
  | "weak"
  | "moderate"
  | "strong"
  | "very_strong";

export type TemporalBucket = "recent" | "mid" | "older";

export type ContextCategoryId =
  | "health_fitness"
  | "work_career"
  | "learning_growth"
  | "relationships_social"
  | "personal_goals"
  | "team_community";

export type ContradictionStrength =
  | "insufficient"
  | "none"
  | "weak"
  | "moderate"
  | "strong";

export type ProfileObservabilityLevel = "low" | "medium" | "high";

export type TraitObservabilityDiagnosis =
  | "insufficient_observation_opportunity"
  | "no_relevant_evidence_found"
  | "assessed"
  | "observation_limited_assessed";

export interface ChangeWindowAssessment {
  changeIntent: ChangeIntentLevel;
  behavioralChange: BehavioralChangeLevel;
  solutionGap: SolutionGapLevel;
}

export interface NeedAssessment {
  needId: string;
  label?: string;
  strength: NeedStrengthLevel;
  relevance: NeedRelevanceLevel;
}

export interface ContactabilityAssessment {
  naturalEntry: NaturalEntryLevel;
  interactionOpenness: InteractionOpennessLevel;
}

export interface ActivityAssessment {
  /** Days since last meaningful Candidate-attributable public activity. */
  daysSinceLastMeaningfulActivity: number | null;
}

export interface LocationAssessment {
  level: LocationLevel;
}

export interface TraitEvidenceEventInput {
  event_id: string;
  story_id?: string;
  episode_id?: string;
  evidence_ref?: string;
  event_timestamp: string;
  context_categories: ContextCategoryId[];
  evidence_strength: EvidenceStrength;
  evidence_quality: EvidenceQuality;
  strength_reasoning?: string;
  quality_reasoning?: string;
}

export interface CoreTraitEvidenceInput {
  trait_id: CoreTraitId;
  evidence_events: TraitEvidenceEventInput[];
}

export interface AnalyzableContentItem {
  id: string;
  timestamp: string;
  /** Pre-filtered: meaningful Candidate-originated content only. */
  isCandidateOriginated: boolean;
  isPureRepost?: boolean;
  isDuplicate?: boolean;
  isEmptyShare?: boolean;
  hasMeaningfulExpression?: boolean;
  isReliablyAttributable?: boolean;
}

export interface ProfileObservabilityInput {
  analyzableItems: AnalyzableContentItem[];
  dataCompleteness?: "full" | "partial";
}

export interface AiRadarExtraction {
  changeWindow: ChangeWindowAssessment;
  needs: NeedAssessment[];
  contactability: ContactabilityAssessment;
  activity: ActivityAssessment;
  location: LocationAssessment;
  coreTraits: CoreTraitEvidenceInput[];
  profileObservability?: ProfileObservabilityInput;
}

export interface TraitEvidenceEvent extends TraitEvidenceEventInput {
  base_evidence_value: number;
  quality_multiplier: number;
  effective_evidence_value: number;
  gate_eligible: boolean;
  temporal_bucket: TemporalBucket;
}

export interface CoreTraitConfidenceComponents {
  evidence_volume: number;
  temporal_coverage: number;
  cross_context_consistency: number;
  contradiction_consistency: number;
}

export interface CoreTraitScoreBreakdown {
  trait_id: CoreTraitId;
  trait_max: number;
  raw_trait_level: TraitLevel;
  effective_trait_level: TraitLevel;
  evidence_mean: number | null;
  evidence_mean_numerator: number;
  evidence_mean_denominator: number;
  directional_evidence_event_count: number;
  gate_eligible_positive_event_count: number;
  gate_eligible_direct_positive_event_count: number;
  gate_eligible_contradictory_event_count: number;
  gate_eligible_direct_contradictory_event_count: number;
  gate_eligible_positive_temporal_buckets: TemporalBucket[];
  gate_eligible_contradictory_temporal_buckets: TemporalBucket[];
  negative_signal_present: boolean;
  gate_reason: string;
  target_ratio: number;
  confidence: number;
  confidence_components: CoreTraitConfidenceComponents;
  final_ratio: number;
  final_trait_score: number;
  evidence_events: TraitEvidenceEvent[];
}

export interface TraitObservability {
  trait_id: CoreTraitId;
  trait_observability_diagnosis: TraitObservabilityDiagnosis;
  profile_observability_level: ProfileObservabilityLevel;
}

export interface ProfileObservabilityResult {
  profile_observability_level: ProfileObservabilityLevel;
  analyzable_item_count: number;
  data_completeness?: "full" | "partial";
  excluded_repost_count: number;
  excluded_duplicate_count: number;
  excluded_empty_share_count: number;
  excluded_no_expression_count: number;
  excluded_unattributable_count: number;
}

export interface CoreTraitsScoreResult {
  trait_scores: CoreTraitScoreBreakdown[];
  core_traits_score: number;
  profile_observability: ProfileObservabilityResult;
  trait_observability: TraitObservability[];
}

export interface ComponentScores {
  change_window_score: number;
  change_intent_score: number;
  behavioral_change_score: number;
  solution_gap_score: number;
  needs_fit_score: number;
  contactability_score: number;
  natural_entry_score: number;
  interaction_openness_score: number;
  core_traits_score: number;
  activity_score: number;
  location_score: number;
}

export interface OverallScoreResult {
  scoring_version: ScoringVersion;
  overall_score: number;
  components: ComponentScores;
  core_traits: CoreTraitsScoreResult;
  /** All needs preserved for intelligence — not summed into score. */
  needs: NeedAssessment[];
}

export interface RankedCandidate {
  candidateId: string;
  overall_score: number;
  display_overall_score: number;
  rank: number;
  result: OverallScoreResult;
}
