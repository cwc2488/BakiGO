/**
 * 5＋5 行動 — business rule targets (Priority 0).
 * UI must render these from engine/service output; never hardcode KPIs in components.
 */

export const FIVE_PLUS_FIVE_RULE_KEYS = {
  fishPoolDaily: "five_plus_five.fish_pool_daily",
  fishPoolWeekly: "five_plus_five.fish_pool_weekly",
  invitationFiveStepsWeekly: "five_plus_five.invitation_five_steps_weekly",
} as const;

export type FivePlusFiveRuleKey =
  (typeof FIVE_PLUS_FIVE_RULE_KEYS)[keyof typeof FIVE_PLUS_FIVE_RULE_KEYS];

/** Source of truth mirrors docs/BUSINESS_RULES.md «5＋5 行動». */
export const FIVE_PLUS_FIVE_RULES = {
  timezone: "Asia/Taipei" as const,
  /** Fixed business week: Monday 00:00 → Sunday 23:59 Asia/Taipei. */
  weekStartsOn: 1 as const, // Monday
  dailyDeadlineHour: 23,
  dailyDeadlineMinute: 59,
  fishPoolDailyTarget: 5,
  /** Derived: 5 × 7 calendar days (includes Sat/Sun). */
  fishPoolWeeklyTarget: 35,
  invitationFiveStepsWeeklyTarget: 5,
  reminderHours: {
    evening: 20,
    final: 23,
  } as const,
  maxReasonableCount: 9999,
} as const;

export type FivePlusFiveTargets = {
  fishPoolDaily: number;
  fishPoolWeekly: number;
  invitationFiveStepsWeekly: number;
};

export function resolveFivePlusFiveTargets(): FivePlusFiveTargets {
  return {
    fishPoolDaily: FIVE_PLUS_FIVE_RULES.fishPoolDailyTarget,
    fishPoolWeekly: FIVE_PLUS_FIVE_RULES.fishPoolWeeklyTarget,
    invitationFiveStepsWeekly: FIVE_PLUS_FIVE_RULES.invitationFiveStepsWeeklyTarget,
  };
}
