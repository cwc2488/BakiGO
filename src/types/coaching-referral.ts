/** Phase 4c — Referral Opportunity types (Outcome ≠ Opportunity ≠ Ask ≠ Attribution). */

export const REFERRAL_CELEBRATION_CLASSES = ["none", "soft", "clear"] as const;
export type ReferralCelebrationClass = (typeof REFERRAL_CELEBRATION_CLASSES)[number];

export const REFERRAL_READINESS_LEVELS = ["not_ready", "emerging", "strong"] as const;
export type ReferralReadinessLevel = (typeof REFERRAL_READINESS_LEVELS)[number];

export const REFERRAL_OPPORTUNITY_STATUSES = [
  "open",
  "acted",
  "snoozed",
  "declined",
  "converted",
  "expired",
  "superseded",
] as const;
export type ReferralOpportunityStatus = (typeof REFERRAL_OPPORTUNITY_STATUSES)[number];

export const CUSTOMER_CONFIRMED_EXPERIENCE_CLASSES = [
  "none",
  "implicit_positive",
  "explicit_positive_experience",
  "explicit_satisfaction",
  "explicit_referral_intent",
  "explicit_struggle",
] as const;
export type CustomerConfirmedExperienceClass =
  (typeof CUSTOMER_CONFIRMED_EXPERIENCE_CLASSES)[number];

export const REFERRAL_BLOCK_REASON_CODES = [
  "owner_mismatch",
  "no_active_enrollment",
  "baseline_only_without_customer_confirmed",
  "insufficient_data_without_customer_confirmed",
  "outcome_worsening",
  "outcome_mixed_muscle_loss",
  "struggle_active",
  "coach_attention_active",
  "explicit_dissatisfaction",
  "declined_active",
  "cooldown_active",
  "ask_recent",
  "duplicate_open",
  "vague_positive_only",
] as const;
export type ReferralBlockReasonCode = (typeof REFERRAL_BLOCK_REASON_CODES)[number];

export const REFERRAL_SUPPORTING_SIGNAL_CODES = [
  "path_a_measured_improving",
  "path_a_trend_or_recomposition",
  "path_b_customer_confirmed",
  "explicit_referral_intent",
  "explicit_satisfaction",
  "execution_support",
  "major_breakthrough",
] as const;
export type ReferralSupportingSignalCode = (typeof REFERRAL_SUPPORTING_SIGNAL_CODES)[number];

export type CustomerConfirmedExperience = {
  class: CustomerConfirmedExperienceClass;
  matchedPatterns: string[];
  rawExcerpt: string | null;
  /** True only for explicit_* classes that can open Path B (not implicit/vague). */
  qualifiesPathB: boolean;
};

export type OutcomeSignalBodyQualityFlag =
  | "muscle_loss_meaningful"
  | "bf_improved"
  | "recomposition"
  | "weight_down_fake_success_risk";

export type OutcomeSignal = {
  customerId: string;
  enrollmentId: string | null;
  ownerMemberId: string;
  asOfLogDate: string;
  measurementStage: import("@/types/coaching-signals").CoachingMeasurementStage;
  outcomeStatus: import("@/types/coaching-signals").CoachingOutcomeStatus;
  trendStatus: import("@/types/coaching-signals").CoachingTrendStatus;
  goalType: string;
  customerSummary: string;
  evidence: string[];
  bodyQualityFlags: OutcomeSignalBodyQualityFlag[];
  attentionTier: import("@/types/coaching-attention").CoachingAttentionTier;
  attentionReasonCodes: string[];
  finalInterventionLevel: "normal" | "watch" | "coach_attention";
  daysSinceEnrollmentStart: number;
  latestMeasurementId: string | null;
  baselineMeasurementId: string | null;
  customerConfirmed: CustomerConfirmedExperience;
  celebrationClass: ReferralCelebrationClass;
};

export type ReferralOpportunityEvaluation = {
  readiness: ReferralReadinessLevel;
  celebrationClass: ReferralCelebrationClass;
  blockedReasons: ReferralBlockReasonCode[];
  supportingSignals: ReferralSupportingSignalCode[];
  pathway: "none" | "measured" | "customer_confirmed" | "measured_and_customer_confirmed" | "explicit_intent";
  fingerprint: string;
  shouldOpen: boolean;
  majorBreakthrough: boolean;
  outcomeSignal: OutcomeSignal;
};

export type ReferralOpportunityRecord = {
  id: string;
  ownerMemberId: string;
  customerId: string;
  enrollmentId: string | null;
  readiness: "emerging" | "strong";
  status: ReferralOpportunityStatus;
  fingerprint: string;
  celebrationClass: ReferralCelebrationClass;
  outcomeStatusSnapshot: string;
  measurementStageSnapshot: string;
  pathwaySnapshot: string;
  evidenceJson: unknown;
  supportingSignalsJson: unknown;
  blockedReasonsJson: unknown;
  snoozeUntil: string | null;
  expiresAt: string | null;
  supersededBy: string | null;
  lastEvaluatedAt: string;
  createdAt: string;
  updatedAt: string;
};

export const REFERRAL_OPPORTUNITY_POLICY = {
  actedCooldownMs: 14 * 24 * 60 * 60 * 1000,
  declinedCooldownMs: 30 * 24 * 60 * 60 * 1000,
  askRecentMs: 14 * 24 * 60 * 60 * 1000,
  defaultSnoozeMs: 7 * 24 * 60 * 60 * 1000,
  defaultExpiresMs: 21 * 24 * 60 * 60 * 1000,
} as const;

export function isReferralOpportunityStatus(value: string): value is ReferralOpportunityStatus {
  return (REFERRAL_OPPORTUNITY_STATUSES as readonly string[]).includes(value);
}
