import {
  COACHING_ACTION_ACK_POLICY,
  COACHING_ATTENTION_RECURRENCE_POLICY,
  COACHING_MEASUREMENT_FOLLOWUP_POLICY,
  COACHING_NON_REPORTING_POLICY,
} from "@/lib/coaching/attention/coach-attention-policy";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { isLateBedtime } from "@/lib/coaching/coaching-sleep";
import type { CoachingInterventionLevel, CoachingRollingMemory } from "@/types/coaching-ai";
import type {
  CoachingAttentionAssessment,
  CoachingAttentionEvidence,
  CoachingAttentionReasonCode,
  CoachingAttentionTier,
  CoachingCommandCenterSection,
  CoachingRecentCoachAction,
  CoachingRecommendedActionType,
  CoachingSubmissionDay,
} from "@/types/coaching-attention";
import type {
  CoachingCoachAttentionDecision,
  CoachingOutcomeAssessment,
  CoachingSignal,
} from "@/types/coaching-signals";

function evidenceBlock(
  type: CoachingAttentionEvidence["type"],
  items: CoachingAttentionEvidence["items"],
  extra?: Partial<CoachingAttentionEvidence>,
): CoachingAttentionEvidence {
  return {
    type,
    items,
    date: extra?.date ?? null,
    value: extra?.value ?? null,
    sourceRef: extra?.sourceRef,
  };
}

function tierRank(tier: CoachingAttentionTier): number {
  switch (tier) {
    case "coach_attention":
      return 4;
    case "watch":
      return 3;
    case "positive_progress":
      return 2;
    case "routine":
    default:
      return 1;
  }
}

function maxTier(a: CoachingAttentionTier, b: CoachingAttentionTier): CoachingAttentionTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

export type CoachingNonReportingAssessment = {
  status: "reported_today" | "today_not_yet" | "short_gap" | "sustained" | "ok";
  consecutiveMissedCompletedDays: number;
  reasonCode: CoachingAttentionReasonCode | null;
  evidence: CoachingAttentionEvidence[];
};

/**
 * Deterministic non-reporting.
 * - Today before grace hour → today_not_yet (never sustained).
 * - Consecutive misses count completed calendar days only (excludes today before grace).
 */
export function assessCoachingNonReporting(input: {
  asOfLogDate: string;
  asOfHourTaipei: number;
  submissionCalendar: CoachingSubmissionDay[];
  rollingMemory: CoachingRollingMemory;
}): CoachingNonReportingAssessment {
  const policy = COACHING_NON_REPORTING_POLICY;
  const byDate = new Map(input.submissionCalendar.map((day) => [day.logDate, day.submitted]));
  const todaySubmitted = byDate.get(input.asOfLogDate) === true;
  const beforeGrace = input.asOfHourTaipei < policy.todayGraceHourTaipei;

  const evidenceItems = [
    { key: "as_of_log_date", value: input.asOfLogDate },
    { key: "as_of_hour_taipei", value: input.asOfHourTaipei },
    { key: "today_submitted", value: todaySubmitted },
    {
      key: "rolling_days_submitted",
      value: `${input.rollingMemory.aggregates.daysSubmitted}/${input.rollingMemory.aggregates.windowDays}`,
    },
  ];

  if (!todaySubmitted && beforeGrace) {
    return {
      status: "today_not_yet",
      consecutiveMissedCompletedDays: 0,
      reasonCode: "today_not_yet_reported",
      evidence: [
        evidenceBlock("non_reporting", evidenceItems, {
          date: input.asOfLogDate,
          value: "today_not_yet",
        }),
      ],
    };
  }

  // Walk backward from yesterday (or today if after grace and missing).
  const startOffset = !todaySubmitted && !beforeGrace ? 0 : 1;
  let consecutive = 0;
  const missedDates: string[] = [];
  for (let offset = startOffset; offset < policy.rollingWindowDays + 2; offset += 1) {
    const date = shiftIsoDate(input.asOfLogDate, -offset);
    const submitted = byDate.get(date);
    // Unknown days (no calendar row) count as miss only when we have an explicit false,
    // or when calendar is dense. Prefer explicit false; absence = no data (stop streak).
    if (submitted === true) {
      break;
    }
    if (submitted === false) {
      consecutive += 1;
      missedDates.push(date);
      continue;
    }
    break;
  }

  const rollingRate =
    input.rollingMemory.aggregates.windowDays > 0
      ? input.rollingMemory.aggregates.daysSubmitted / input.rollingMemory.aggregates.windowDays
      : 1;
  const rollingInconsistent =
    input.rollingMemory.aggregates.daysSubmitted > 0 &&
    rollingRate < policy.rollingSubmissionRateWatchThreshold;
  const rollingPattern = input.rollingMemory.recurringPatterns.includes("submission_inconsistent");

  const sustainedByStreak = consecutive >= policy.sustainedMissDays;
  const sustainedByRolling = rollingInconsistent || rollingPattern;

  if (sustainedByStreak || (sustainedByRolling && consecutive >= policy.shortMissDays)) {
    return {
      status: "sustained",
      consecutiveMissedCompletedDays: consecutive,
      reasonCode: "sustained_non_reporting",
      evidence: [
        evidenceBlock("non_reporting", [
          ...evidenceItems,
          { key: "consecutive_missed_days", value: consecutive },
          { key: "missed_dates", value: missedDates.slice(0, 7).join(",") },
          { key: "rolling_inconsistent", value: sustainedByRolling },
        ], {
          date: missedDates[0] ?? input.asOfLogDate,
          value: consecutive,
        }),
      ],
    };
  }

  if (consecutive >= policy.shortMissDays) {
    return {
      status: "short_gap",
      consecutiveMissedCompletedDays: consecutive,
      reasonCode: "short_non_reporting",
      evidence: [
        evidenceBlock("non_reporting", [
          ...evidenceItems,
          { key: "consecutive_missed_days", value: consecutive },
          { key: "missed_dates", value: missedDates.join(",") },
        ], {
          date: missedDates[0] ?? input.asOfLogDate,
          value: consecutive,
        }),
      ],
    };
  }

  if (todaySubmitted) {
    return {
      status: "reported_today",
      consecutiveMissedCompletedDays: 0,
      reasonCode: null,
      evidence: [],
    };
  }

  return {
    status: "ok",
    consecutiveMissedCompletedDays: consecutive,
    reasonCode: null,
    evidence: [],
  };
}

export function assessMeasurementReminder(input: {
  measurementStage: string;
  baselineMissing: boolean;
  daysSinceLatestMeasurement: number | null;
  daysSinceEnrollmentStart: number;
}): { measurementReminder: boolean; evidence: CoachingAttentionEvidence[] } {
  const policy = COACHING_MEASUREMENT_FOLLOWUP_POLICY;
  if (input.baselineMissing) {
    return { measurementReminder: false, evidence: [] };
  }
  const elapsed = input.daysSinceLatestMeasurement;
  if (elapsed == null || elapsed < policy.followUpDaysAfterLatestMeasurement) {
    return { measurementReminder: false, evidence: [] };
  }
  return {
    measurementReminder: true,
    evidence: [
      evidenceBlock(
        "measurement",
        [
          { key: "measurement_stage", value: input.measurementStage },
          { key: "days_since_latest_measurement", value: elapsed },
          {
            key: "follow_up_days_policy",
            value: policy.followUpDaysAfterLatestMeasurement,
          },
          { key: "policy_id", value: policy.policyId },
          { key: "copy_intent", value: "suggest_retest" },
        ],
        { value: "measurement_due" },
      ),
    ],
  };
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  const yy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function countHungerOccurrences(input: {
  asOfLogDate: string;
  rollingMemory: CoachingRollingMemory;
  todayCustomerNote: string | null;
  historicalNotes?: Array<{ logDate: string; customerNote: string | null }>;
}): { count: number; dates: string[] } {
  const windowStart = shiftIsoDate(
    input.asOfLogDate,
    -(COACHING_ATTENTION_RECURRENCE_POLICY.hungerWatchWindowDays - 1),
  );
  const notes = new Map<string, string | null>();
  for (const day of input.rollingMemory.recentDays) {
    notes.set(day.logDate, day.customerNote);
  }
  for (const item of input.historicalNotes ?? []) {
    notes.set(item.logDate, item.customerNote);
  }
  notes.set(input.asOfLogDate, input.todayCustomerNote);

  const dates: string[] = [];
  for (const [logDate, note] of notes) {
    if (logDate < windowStart || logDate > input.asOfLogDate) continue;
    const voices = extractCustomerVoiceSignals(note);
    if (voices.some((voice) => voice.key === "hunger_reported")) {
      dates.push(logDate);
    }
  }
  dates.sort();
  return { count: dates.length, dates };
}

function findMatchingRecentAction(input: {
  actions: CoachingRecentCoachAction[];
  reasonCodes: CoachingAttentionReasonCode[];
  asOfIso: string;
}): CoachingRecentCoachAction | null {
  const asOfMs = Date.parse(input.asOfIso);
  const windowMs = COACHING_ACTION_ACK_POLICY.suppressDuplicateRecommendationMs;
  const matches = input.actions
    .filter((action) => {
      const createdMs = Date.parse(action.createdAt);
      if (Number.isNaN(createdMs) || Number.isNaN(asOfMs)) return false;
      if (asOfMs - createdMs > windowMs || asOfMs < createdMs) return false;
      return action.relatedReasonCodes.some((code) => input.reasonCodes.includes(code));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return matches[0] ?? null;
}

function mapRecommendedAction(
  reasonCodes: CoachingAttentionReasonCode[],
  measurementReminder: boolean,
): CoachingRecommendedActionType | null {
  if (reasonCodes.includes("final_intervention_coach_attention") || reasonCodes.includes("phase2_coach_attention_required")) {
    return "follow_up_unresolved_action";
  }
  if (reasonCodes.includes("sustained_non_reporting")) {
    return "contact_for_non_reporting";
  }
  if (reasonCodes.includes("customer_voice_recurring_hunger")) {
    return "review_hunger_pattern";
  }
  if (
    reasonCodes.includes("outcome_flat_two_period") ||
    reasonCodes.includes("outcome_worsening") ||
    reasonCodes.includes("execution_outcome_mismatch")
  ) {
    return "review_execution_and_outcome";
  }
  if (reasonCodes.includes("recurring_late_sleep")) {
    return "ask_late_sleep_reason";
  }
  if (measurementReminder || reasonCodes.includes("measurement_due")) {
    return "schedule_retest";
  }
  if (reasonCodes.includes("positive_body_outcome")) {
    return "acknowledge_positive_progress";
  }
  if (reasonCodes.includes("short_non_reporting") || reasonCodes.includes("recurring_low_hydration") || reasonCodes.includes("recurring_meal_execution")) {
    return "continue_observe";
  }
  return null;
}

function resolveCommandCenterSection(input: {
  tier: CoachingAttentionTier;
  measurementReminder: boolean;
}): CoachingCommandCenterSection {
  if (input.tier === "coach_attention") return "needs_attention";
  if (input.tier === "watch") return "watch";
  if (input.measurementReminder) return "measurement_due";
  if (input.tier === "positive_progress") return "positive_progress";
  return "routine";
}

function primaryReasonLabel(codes: CoachingAttentionReasonCode[]): string | null {
  const labels: Partial<Record<CoachingAttentionReasonCode, string>> = {
    final_intervention_coach_attention: "Deterministic intervention 已要求教練介入。",
    phase2_coach_attention_required: "既有 coach attention signal 需要處理。",
    sustained_non_reporting: "持續未回報，需要確認是否掉隊。",
    short_non_reporting: "短期漏報，先持續觀察。",
    today_not_yet_reported: "今天尚未回報（仍在寬限時段內）。",
    recurring_late_sleep: "最近晚睡頻率增加。",
    recurring_low_hydration: "最近水分執行不穩定。",
    recurring_meal_execution: "最近餐點執行反覆出現問題。",
    customer_voice_recurring_hunger: "Customer 反覆回報飢餓。",
    outcome_flat_two_period: "連續兩段量測結果無改善。",
    outcome_worsening: "身體結果出現惡化跡象。",
    execution_outcome_mismatch: "執行尚可但身體結果未改善。",
    measurement_due: "建議安排回測。完成下一次量測後，系統才能進一步判斷身體變化。",
    unresolved_coach_action: "仍有未完成的教練追蹤事項。",
    positive_body_outcome: "身體結果有可信改善。",
    stable_execution: "近期執行穩定。",
    final_intervention_watch: "Deterministic intervention 為持續觀察。",
  };
  for (const code of codes) {
    if (labels[code]) return labels[code]!;
  }
  return null;
}

export type AssessCoachAttentionInput = {
  asOfLogDate: string;
  /** Taipei hour 0–23; defaults to 12 (afternoon — still within grace). */
  asOfHourTaipei?: number;
  /** ISO timestamp for coach-action suppress window comparisons. */
  asOfIso?: string;
  daysSinceEnrollmentStart: number;
  finalInterventionLevel: CoachingInterventionLevel;
  coachAttention: CoachingCoachAttentionDecision;
  signals: CoachingSignal[];
  outcomeAssessment: CoachingOutcomeAssessment;
  rollingMemory: CoachingRollingMemory;
  submissionCalendar?: CoachingSubmissionDay[];
  todayCustomerNote?: string | null;
  historicalCustomerNotes?: Array<{ logDate: string; customerNote: string | null }>;
  recentCoachActions?: CoachingRecentCoachAction[];
};

/**
 * Phase 3 deterministic Coach Attention Engine.
 * Derives Command Center tier from existing Phase 2 authority — never invents
 * intervention/outcome/measurement stage. GPT must not call this path for ranking.
 */
export function assessCoachAttention(input: AssessCoachAttentionInput): CoachingAttentionAssessment {
  const asOfHour = input.asOfHourTaipei ?? 12;
  const asOfIso = input.asOfIso ?? `${input.asOfLogDate}T12:00:00.000+08:00`;
  const reasonCodes: CoachingAttentionReasonCode[] = [];
  const evidence: CoachingAttentionEvidence[] = [];
  let tier: CoachingAttentionTier = "routine";

  const submissionCalendar =
    input.submissionCalendar ??
    buildSubmissionCalendarFromRolling(input.rollingMemory, input.asOfLogDate);

  const nonReporting = assessCoachingNonReporting({
    asOfLogDate: input.asOfLogDate,
    asOfHourTaipei: asOfHour,
    submissionCalendar,
    rollingMemory: input.rollingMemory,
  });
  if (nonReporting.reasonCode) {
    reasonCodes.push(nonReporting.reasonCode);
    evidence.push(...nonReporting.evidence);
  }

  const measurement = assessMeasurementReminder({
    measurementStage: input.outcomeAssessment.goalContext.measurementStage,
    baselineMissing: !input.outcomeAssessment.goalContext.baselineDate,
    daysSinceLatestMeasurement: input.outcomeAssessment.goalContext.daysSinceLatestMeasurement,
    daysSinceEnrollmentStart: input.daysSinceEnrollmentStart,
  });
  if (measurement.measurementReminder) {
    reasonCodes.push("measurement_due");
    evidence.push(...measurement.evidence);
  }

  // --- Highest: Phase 2 intervention / coach attention authority ---
  if (input.finalInterventionLevel === "coach_attention" || input.coachAttention.required) {
    tier = "coach_attention";
    if (input.finalInterventionLevel === "coach_attention") {
      reasonCodes.push("final_intervention_coach_attention");
    }
    if (input.coachAttention.required) {
      reasonCodes.push("phase2_coach_attention_required");
      evidence.push(
        evidenceBlock("intervention", input.coachAttention.evidence, {
          value: input.coachAttention.reason,
        }),
      );
    }
  }

  if (
    nonReporting.status === "sustained" &&
    nonReporting.consecutiveMissedCompletedDays >= COACHING_NON_REPORTING_POLICY.coachAttentionMissDays
  ) {
    tier = maxTier(tier, "coach_attention");
  } else if (nonReporting.status === "sustained") {
    tier = maxTier(tier, "watch");
  } else if (nonReporting.status === "short_gap") {
    tier = maxTier(tier, "watch");
  }

  // --- High / Watch: intervention watch + recurring patterns ---
  if (input.finalInterventionLevel === "watch") {
    tier = maxTier(tier, "watch");
    reasonCodes.push("final_intervention_watch");
    evidence.push(
      evidenceBlock("intervention", [{ key: "final_intervention_level", value: "watch" }]),
    );
  }

  const lateSleep = input.signals.find((item) => item.key === "late_sleep_pattern");
  const lateSleepDays = input.rollingMemory.aggregates.lateSleepDays;
  if (
    (lateSleep && (lateSleep.severity === "moderate" || lateSleep.severity === "high")) ||
    lateSleepDays >= COACHING_ATTENTION_RECURRENCE_POLICY.lateSleepWatchDays
  ) {
    tier = maxTier(tier, "watch");
    reasonCodes.push("recurring_late_sleep");
    const lateDates = input.rollingMemory.recentDays
      .filter((day) => isLateBedtime(day.sleepBedtime))
      .map((day) => day.logDate);
    evidence.push(
      evidenceBlock(
        "late_sleep",
        [
          ...(lateSleep?.evidence ?? [
            { key: "late_sleep_days", value: lateSleepDays },
            {
              key: "threshold_days",
              value: COACHING_ATTENTION_RECURRENCE_POLICY.lateSleepWatchDays,
            },
          ]),
          { key: "late_sleep_dates", value: lateDates.join(",") },
        ],
        {
          value: lateSleepDays,
          sourceRef: { kind: "signal", id: "late_sleep_pattern" },
        },
      ),
    );
  }

  const hydration = input.signals.find(
    (item) =>
      item.key === "hydration_below_plan" &&
      item.source === "rolling" &&
      (item.severity === "moderate" || item.severity === "high"),
  );
  if (hydration && (hydration.severity === "moderate" || hydration.severity === "high")) {
    tier = maxTier(tier, "watch");
    reasonCodes.push("recurring_low_hydration");
    evidence.push(
      evidenceBlock("hydration", hydration.evidence, {
        sourceRef: { kind: "signal", id: hydration.key },
      }),
    );
  }

  const mealPattern = input.signals.find(
    (item) =>
      item.source === "rolling" &&
      item.category === "meal" &&
      (item.severity === "moderate" || item.severity === "high"),
  );
  if (mealPattern) {
    tier = maxTier(tier, "watch");
    reasonCodes.push("recurring_meal_execution");
    evidence.push(
      evidenceBlock("meal_execution", mealPattern.evidence, {
        sourceRef: { kind: "signal", id: mealPattern.key },
      }),
    );
  }

  const hunger = countHungerOccurrences({
    asOfLogDate: input.asOfLogDate,
    rollingMemory: input.rollingMemory,
    todayCustomerNote: input.todayCustomerNote ?? null,
    historicalNotes: input.historicalCustomerNotes,
  });
  if (hunger.count >= COACHING_ATTENTION_RECURRENCE_POLICY.hungerWatchOccurrences) {
    tier = maxTier(tier, "watch");
    reasonCodes.push("customer_voice_recurring_hunger");
    evidence.push(
      evidenceBlock(
        "customer_voice",
        [
          { key: "hunger_occurrence_count", value: hunger.count },
          { key: "hunger_dates", value: hunger.dates.join(",") },
          {
            key: "threshold",
            value: COACHING_ATTENTION_RECURRENCE_POLICY.hungerWatchOccurrences,
          },
        ],
        { value: hunger.count },
      ),
    );
  }

  const outcome = input.outcomeAssessment.outcomeStatus;
  const stage = input.outcomeAssessment.goalContext.measurementStage;
  if (stage !== "baseline_only") {
    if (outcome === "worsening") {
      tier = maxTier(tier, "watch");
      reasonCodes.push("outcome_worsening");
      evidence.push(evidenceBlock("body_outcome", input.outcomeAssessment.evidence, { value: outcome }));
    }

    const periods = input.outcomeAssessment.periods;
    const lastTwo = periods.slice(-2);
    const twoPeriodFlat =
      lastTwo.length >= 2 &&
      lastTwo.every((period) => period.status === "flat" || period.status === "worsening");
    if (twoPeriodFlat) {
      tier = maxTier(tier, "watch");
      reasonCodes.push("outcome_flat_two_period");
      evidence.push(
        evidenceBlock("body_outcome", [
          ...input.outcomeAssessment.evidence,
          {
            key: "periods",
            value: lastTwo.map((period) => `${period.fromDate}:${period.status}`).join("|"),
          },
        ], { value: "two_period_flat" }),
      );
    }

    const executionStable =
      input.rollingMemory.aggregates.daysSubmitted / Math.max(input.rollingMemory.aggregates.windowDays, 1) >= 0.7 &&
      (input.rollingMemory.aggregates.lateSleepDays ?? 0) < COACHING_ATTENTION_RECURRENCE_POLICY.lateSleepWatchDays;
    if (executionStable && (outcome === "flat" || outcome === "worsening")) {
      reasonCodes.push("execution_outcome_mismatch");
      evidence.push(
        evidenceBlock("body_outcome", [
          { key: "execution_stable", value: true },
          { key: "outcome_status", value: outcome },
        ]),
      );
      tier = maxTier(tier, "watch");
    }
  }

  // Unresolved coach actions (follow-up), without permanently locking tier.
  const unresolved = (input.recentCoachActions ?? []).filter((action) => action.resolvedAt == null);
  if (unresolved.length > 0 && tier === "routine") {
    // Soft: unresolved alone does not force attention unless linked to active reasons.
    // If there is an unresolved action AND matching active watch reason, keep watch.
  }
  if (unresolved.length > 0) {
    const linked = unresolved.some((action) =>
      action.relatedReasonCodes.some((code) => reasonCodes.includes(code) || code === "unresolved_coach_action"),
    );
    if (linked || unresolved.some((a) => a.relatedReasonCodes.includes("unresolved_coach_action"))) {
      reasonCodes.push("unresolved_coach_action");
      evidence.push(
        evidenceBlock(
          "coach_action",
          unresolved.slice(0, 3).map((action) => ({
            key: "coach_action",
            value: action.note ?? action.actionType,
            label: action.id,
          })),
        ),
      );
    }
  }

  // Positive progress only if nothing higher than routine would apply.
  const hasMaterialIssue =
    tier === "coach_attention" ||
    tier === "watch" ||
    reasonCodes.some((code) =>
      [
        "sustained_non_reporting",
        "short_non_reporting",
        "recurring_late_sleep",
        "customer_voice_recurring_hunger",
        "outcome_flat_two_period",
        "outcome_worsening",
        "execution_outcome_mismatch",
        "final_intervention_watch",
        "final_intervention_coach_attention",
        "phase2_coach_attention_required",
      ].includes(code),
    );

  const improving = outcome === "improving";
  const stableExecution =
    input.rollingMemory.aggregates.daysWithReport >= 5 &&
    input.rollingMemory.aggregates.daysSubmitted / Math.max(input.rollingMemory.aggregates.windowDays, 1) >= 0.7 &&
    (input.rollingMemory.aggregates.lateSleepDays ?? 0) < COACHING_ATTENTION_RECURRENCE_POLICY.lateSleepWatchDays;

  if (!hasMaterialIssue && improving && stableExecution) {
    tier = "positive_progress";
    reasonCodes.push("positive_body_outcome", "stable_execution");
    evidence.push(
      evidenceBlock("body_outcome", input.outcomeAssessment.evidence, { value: "improving" }),
    );
  } else if (!hasMaterialIssue && improving) {
    // Improving but not enough execution evidence — stay routine (not fake celebration).
    reasonCodes.push("positive_body_outcome");
  }

  // Deduplicate reason codes (stable order)
  const uniqueCodes = [...new Set(reasonCodes)];

  let recommendedActionType = mapRecommendedAction(uniqueCodes, measurement.measurementReminder);
  const suppressedReasonCodes: CoachingAttentionReasonCode[] = [];
  let recentCoachActionAcknowledged = false;

  if (recommendedActionType && input.recentCoachActions?.length) {
    const match = findMatchingRecentAction({
      actions: input.recentCoachActions,
      reasonCodes: uniqueCodes,
      asOfIso,
    });
    if (match) {
      recentCoachActionAcknowledged = true;
      const overlapped = match.relatedReasonCodes.filter((code) => uniqueCodes.includes(code));
      suppressedReasonCodes.push(...overlapped);
      // Keep underlying evidence/tier. Suppress duplicate clarification asks only when
      // severity has NOT escalated to coach_attention (CA-G / CC-K / CC-L).
      if (tier !== "coach_attention") {
        recommendedActionType = "continue_observe_known_context";
      }
    }
  }

  // Single-day noise: if only today_not_yet / measurement_due / soft codes and tier still routine, OK.
  // Explicitly ensure single-day meal signals alone never raise tier (Phase 2 already keeps intervention normal).

  const consecutiveMissedCompletedDays = nonReporting.consecutiveMissedCompletedDays;
  const rankScore = computeAttentionRankScore({
    tier,
    reasonCodes: uniqueCodes,
    consecutiveMissedCompletedDays,
    measurementReminder: measurement.measurementReminder,
    daysSinceLatestMeasurement: input.outcomeAssessment.goalContext.daysSinceLatestMeasurement,
    lateSleepDays: input.rollingMemory.aggregates.lateSleepDays,
    finalInterventionLevel: input.finalInterventionLevel,
  });

  return {
    tier,
    commandCenterSection: resolveCommandCenterSection({
      tier,
      measurementReminder: measurement.measurementReminder,
    }),
    reasonCodes: uniqueCodes,
    primaryReason: primaryReasonLabel(uniqueCodes),
    evidence,
    recommendedActionType,
    measurementReminder: measurement.measurementReminder,
    suppressedReasonCodes: [...new Set(suppressedReasonCodes)],
    recentCoachActionAcknowledged,
    consecutiveMissedCompletedDays,
    rankScore,
  };
}

/** Deterministic within-section urgency. Higher = show first. */
export function computeAttentionRankScore(input: {
  tier: CoachingAttentionTier;
  reasonCodes: CoachingAttentionReasonCode[];
  consecutiveMissedCompletedDays: number;
  measurementReminder: boolean;
  daysSinceLatestMeasurement: number | null;
  lateSleepDays: number;
  finalInterventionLevel: CoachingInterventionLevel;
}): number {
  let score = tierRank(input.tier) * 100_000;
  score += Math.min(input.consecutiveMissedCompletedDays, 30) * 1_000;
  if (input.reasonCodes.includes("final_intervention_coach_attention") || input.reasonCodes.includes("phase2_coach_attention_required")) {
    score += 20_000;
  }
  if (input.reasonCodes.includes("sustained_non_reporting")) {
    score += 5_000;
  }
  if (input.reasonCodes.includes("short_non_reporting")) {
    score += 1_000;
  }
  if (input.reasonCodes.includes("outcome_worsening") || input.reasonCodes.includes("outcome_flat_two_period")) {
    score += 3_000;
  }
  if (input.reasonCodes.includes("customer_voice_recurring_hunger")) {
    score += 2_000;
  }
  if (input.reasonCodes.includes("recurring_late_sleep")) {
    score += 1_500 + Math.min(input.lateSleepDays, 14) * 50;
  }
  if (input.finalInterventionLevel === "coach_attention") {
    score += 15_000;
  } else if (input.finalInterventionLevel === "watch") {
    score += 2_500;
  }
  if (input.measurementReminder) {
    score += Math.min(input.daysSinceLatestMeasurement ?? 0, 90) * 10;
  }
  return score;
}

export function compareCommandCenterCardsByRank(
  left: { assessment: { rankScore: number; consecutiveMissedCompletedDays: number }; customerDisplayName: string },
  right: { assessment: { rankScore: number; consecutiveMissedCompletedDays: number }; customerDisplayName: string },
): number {
  if (right.assessment.rankScore !== left.assessment.rankScore) {
    return right.assessment.rankScore - left.assessment.rankScore;
  }
  if (right.assessment.consecutiveMissedCompletedDays !== left.assessment.consecutiveMissedCompletedDays) {
    return right.assessment.consecutiveMissedCompletedDays - left.assessment.consecutiveMissedCompletedDays;
  }
  return left.customerDisplayName.localeCompare(right.customerDisplayName, "zh-Hant");
}

function buildSubmissionCalendarFromRolling(
  rolling: CoachingRollingMemory,
  asOfLogDate: string,
): CoachingSubmissionDay[] {
  const days: CoachingSubmissionDay[] = rolling.recentDays.map((day) => ({
    logDate: day.logDate,
    submitted: day.submitted,
  }));
  if (!days.some((day) => day.logDate === asOfLogDate)) {
    days.push({ logDate: asOfLogDate, submitted: false });
  }
  return days;
}
