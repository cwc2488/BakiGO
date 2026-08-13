import type { CoachingSignalEvidence } from "@/types/coaching-signals";

/**
 * Command Center attention tiers (Phase 3).
 * Separate from CoachingInterventionLevel — do not overload intervention enums.
 */
export const COACHING_ATTENTION_TIERS = [
  "coach_attention",
  "watch",
  "routine",
  "positive_progress",
] as const;

export type CoachingAttentionTier = (typeof COACHING_ATTENTION_TIERS)[number];

/** Command Center homepage sections (Phase 3b will render these). */
export const COACHING_COMMAND_CENTER_SECTIONS = [
  "needs_attention",
  "watch",
  "measurement_due",
  "positive_progress",
  "routine",
] as const;

export type CoachingCommandCenterSection = (typeof COACHING_COMMAND_CENTER_SECTIONS)[number];

export const COACHING_ATTENTION_REASON_CODES = [
  "final_intervention_coach_attention",
  "final_intervention_watch",
  "phase2_coach_attention_required",
  "sustained_non_reporting",
  "short_non_reporting",
  "today_not_yet_reported",
  "recurring_late_sleep",
  "recurring_low_hydration",
  "recurring_meal_execution",
  "customer_voice_recurring_hunger",
  "outcome_flat_two_period",
  "outcome_worsening",
  "execution_outcome_mismatch",
  "measurement_due",
  "unresolved_coach_action",
  "positive_body_outcome",
  "stable_execution",
] as const;

export type CoachingAttentionReasonCode = (typeof COACHING_ATTENTION_REASON_CODES)[number];

export const COACHING_ATTENTION_EVIDENCE_TYPES = [
  "late_sleep",
  "hydration",
  "meal_execution",
  "non_reporting",
  "customer_voice",
  "body_outcome",
  "measurement",
  "intervention",
  "coach_action",
  "signal",
] as const;

export type CoachingAttentionEvidenceType = (typeof COACHING_ATTENTION_EVIDENCE_TYPES)[number];

export type CoachingAttentionEvidence = {
  type: CoachingAttentionEvidenceType;
  date?: string | null;
  value?: string | number | boolean | null;
  /** Reuse Phase 2 signal evidence keys where available. */
  items: CoachingSignalEvidence[];
  sourceRef?: {
    kind: "daily_log" | "measurement" | "ai_output" | "coach_action" | "signal";
    id?: string | null;
    logDate?: string | null;
  };
};

export const COACHING_RECOMMENDED_ACTION_TYPES = [
  "contact_for_non_reporting",
  "ask_late_sleep_reason",
  "review_hunger_pattern",
  "review_execution_and_outcome",
  "schedule_retest",
  "follow_up_unresolved_action",
  "acknowledge_positive_progress",
  "continue_observe",
  "continue_observe_known_context",
] as const;

export type CoachingRecommendedActionType = (typeof COACHING_RECOMMENDED_ACTION_TYPES)[number];

/**
 * In-memory / future GenerationInput slice for Coach Action Memory (Phase 3d/3e).
 * Persistence lives in proposed `coaching_coach_actions` — not required for engine unit tests.
 */
export type CoachingRecentCoachAction = {
  id: string;
  actionType: string;
  relatedReasonCodes: CoachingAttentionReasonCode[];
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type CoachingRecentCoachActionMemory = {
  recentActions: CoachingRecentCoachAction[];
  unresolvedActions: CoachingRecentCoachAction[];
};

export type CoachingAttentionAssessment = {
  tier: CoachingAttentionTier;
  commandCenterSection: CoachingCommandCenterSection;
  reasonCodes: CoachingAttentionReasonCode[];
  primaryReason: string | null;
  evidence: CoachingAttentionEvidence[];
  recommendedActionType: CoachingRecommendedActionType | null;
  measurementReminder: boolean;
  /** Reason codes whose duplicate recommendation was suppressed by recent coach action. */
  suppressedReasonCodes: CoachingAttentionReasonCode[];
  recentCoachActionAcknowledged: boolean;
  /**
   * Consecutive completed calendar days without submit (dense calendar; respects 20:00 grace).
   * Used for within-section ranking when tier is identical.
   */
  consecutiveMissedCompletedDays: number;
  /**
   * Higher = more urgent within the same Command Center section.
   * Deterministic — never from GPT.
   */
  rankScore: number;
};

/** Reporting calendar day for non-reporting assessment (Asia/Taipei log_date). */
export type CoachingSubmissionDay = {
  logDate: string;
  submitted: boolean;
  /** present | missing — dense calendars always include every day in the window. */
  presence?: "present" | "missing";
};

export type CoachingCommandCenterFilter =
  | "all"
  | "needs_attention"
  | "watch"
  | "measurement_due"
  | "positive_progress";

export type CoachingCommandCenterCard = {
  enrollmentId: string;
  customerId: string;
  customerDisplayName: string;
  customerPhone: string | null;
  goal: string | null;
  dayNumber: number | null;
  dayTotal: number;
  outcomeStatus: string | null;
  outcomeStatusLabel: string | null;
  measurementStage: string | null;
  daysSinceLatestMeasurement: number | null;
  latestMeasurementDate: string | null;
  assessment: CoachingAttentionAssessment;
  evidenceSummary: string | null;
  recommendedActionLabel: string | null;
  detailHref: string;
};
