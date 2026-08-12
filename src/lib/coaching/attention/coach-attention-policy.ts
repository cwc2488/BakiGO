/**
 * Phase 3 Coach Attention policies (product-confirmed for measurement + non-reporting).
 * Keep all thresholds here — no scattered magic numbers.
 */

export const COACHING_NON_REPORTING_POLICY = {
  policyId: "coaching_non_reporting_v1",
  isProvisional: false as const,
  timezone: "Asia/Taipei" as const,
  /**
   * Before this Taipei hour on `asOfLogDate`, missing today's submit is
   * `today_not_yet_reported` only — never short/sustained disengagement.
   */
  todayGraceHourTaipei: 20,
  /** Consecutive completed days without submit → watch (lower rank than sustained). */
  shortMissDays: 2,
  /** Consecutive completed days without submit / rolling inconsistent → watch (higher rank). */
  sustainedMissDays: 4,
  /** Consecutive misses → coach_attention from non-reporting alone. */
  coachAttentionMissDays: 7,
  /** Reuse rolling submission_inconsistent threshold. */
  rollingSubmissionRateWatchThreshold: 0.5,
  rollingWindowDays: 14,
} as const;

/**
 * Product-confirmed measurement follow-up:
 * measurement_due when latest valid measurement is >= 14 days ago.
 * Copy =「建議安排回測」— never overdue / failure / flat.
 */
export const COACHING_MEASUREMENT_FOLLOWUP_POLICY = {
  policyId: "coaching_measurement_followup_v1",
  isProvisional: false as const,
  followUpDaysAfterLatestMeasurement: 14,
} as const;

export const COACHING_ATTENTION_RECURRENCE_POLICY = {
  policyId: "coaching_attention_recurrence_v1",
  /** Aligns with rolling late_sleep_pattern (>= 3 late days). */
  lateSleepWatchDays: 3,
  /** Customer hunger notes across rolling recent/calendar days. */
  hungerWatchOccurrences: 3,
  hungerWatchWindowDays: 14,
} as const;

/**
 * After Coach records a matching action, suppress identical recommendedActionType
 * for this window. Underlying tier is NOT permanently cleared (CC-L).
 */
export const COACHING_ACTION_ACK_POLICY = {
  policyId: "coaching_action_ack_provisional_v1",
  isProvisional: true as const,
  suppressDuplicateRecommendationMs: 48 * 60 * 60 * 1000,
} as const;

export const COACHING_ATTENTION_PRECEDENCE: ReadonlyArray<
  import("@/types/coaching-attention").CoachingAttentionTier
> = ["coach_attention", "watch", "positive_progress", "routine"];
