import {
  REFERRAL_OPPORTUNITY_POLICY,
  type OutcomeSignal,
  type ReferralBlockReasonCode,
  type ReferralOpportunityEvaluation,
  type ReferralOpportunityRecord,
  type ReferralReadinessLevel,
  type ReferralSupportingSignalCode,
} from "@/types/coaching-referral";
import { buildReferralOpportunityFingerprint } from "@/lib/coaching/referral/referral-opportunity-fingerprint";

export type EvaluateReferralOpportunityInput = {
  outcomeSignal: OutcomeSignal;
  /** Caller member id — must equal owner for access. */
  evaluatingMemberId: string;
  priorOpportunities?: ReferralOpportunityRecord[];
  /** Recent coach ask / decline markers from Coach Actions (optional). */
  recentAskAt?: string | null;
  recentDeclinedAt?: string | null;
  asOfIso?: string;
  executionStable?: boolean;
};

const NEGATIVE_ATTENTION_CODES = new Set([
  "sustained_non_reporting",
  "short_non_reporting",
  "customer_voice_recurring_hunger",
  "outcome_flat_two_period",
  "outcome_worsening",
  "execution_outcome_mismatch",
  "recurring_late_sleep",
  "recurring_low_hydration",
  "recurring_meal_execution",
  "final_intervention_coach_attention",
  "phase2_coach_attention_required",
]);

function maxReadiness(a: ReferralReadinessLevel, b: ReferralReadinessLevel): ReferralReadinessLevel {
  const order: ReferralReadinessLevel[] = ["not_ready", "emerging", "strong"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))]!;
}

function isStruggleActive(signal: OutcomeSignal): boolean {
  if (signal.customerConfirmed.class === "explicit_struggle") return true;
  if (signal.finalInterventionLevel === "coach_attention") return true;
  if (signal.attentionTier === "coach_attention") return true;
  if (signal.attentionTier === "watch") {
    return signal.attentionReasonCodes.some((code) => NEGATIVE_ATTENTION_CODES.has(code));
  }
  return false;
}

function detectMajorBreakthrough(signal: OutcomeSignal, prior: ReferralOpportunityRecord[]): boolean {
  // Ordinary first comparison-level improving is NOT a breakthrough (RO-08 / RO-11).
  const hadTrendImproving = prior.some(
    (row) =>
      row.measurementStageSnapshot === "trend_available" && row.outcomeStatusSnapshot === "improving",
  );
  if (
    signal.measurementStage === "trend_available" &&
    signal.outcomeStatus === "improving" &&
    !hadTrendImproving
  ) {
    return true;
  }
  if (signal.bodyQualityFlags.includes("recomposition")) {
    const hadRecomp = prior.some(
      (row) =>
        JSON.stringify(row.evidenceJson).includes("recomposition") ||
        JSON.stringify(row.supportingSignalsJson).includes("path_a_trend_or_recomposition"),
    );
    if (!hadRecomp) return true;
  }
  return false;
}

function cooldownActive(input: {
  asOfMs: number;
  prior: ReferralOpportunityRecord[];
  recentAskAt?: string | null;
  recentDeclinedAt?: string | null;
  majorBreakthrough: boolean;
}): boolean {
  if (input.recentDeclinedAt) {
    const declinedMs = Date.parse(input.recentDeclinedAt);
    if (!Number.isNaN(declinedMs) && input.asOfMs - declinedMs < REFERRAL_OPPORTUNITY_POLICY.declinedCooldownMs) {
      return true;
    }
  }
  const declinedRow = input.prior
    .filter((row) => row.status === "declined")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (declinedRow) {
    const declinedMs = Date.parse(declinedRow.updatedAt);
    if (!Number.isNaN(declinedMs) && input.asOfMs - declinedMs < REFERRAL_OPPORTUNITY_POLICY.declinedCooldownMs) {
      return true;
    }
  }

  if (input.majorBreakthrough) {
    return false;
  }

  if (input.recentAskAt) {
    const askMs = Date.parse(input.recentAskAt);
    if (!Number.isNaN(askMs) && input.asOfMs - askMs < REFERRAL_OPPORTUNITY_POLICY.askRecentMs) {
      return true;
    }
  }
  const actedRow = input.prior
    .filter((row) => row.status === "acted")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (actedRow) {
    const actedMs = Date.parse(actedRow.updatedAt);
    if (!Number.isNaN(actedMs) && input.asOfMs - actedMs < REFERRAL_OPPORTUNITY_POLICY.actedCooldownMs) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic Referral Opportunity Engine.
 * Does not mutate Body Outcome authority.
 */
export function evaluateReferralOpportunity(
  input: EvaluateReferralOpportunityInput,
): ReferralOpportunityEvaluation {
  const signal = input.outcomeSignal;
  const prior = input.priorOpportunities ?? [];
  const asOfIso = input.asOfIso ?? `${signal.asOfLogDate}T18:00:00.000+08:00`;
  const asOfMs = Date.parse(asOfIso);
  const blockedReasons: ReferralBlockReasonCode[] = [];
  const supportingSignals: ReferralSupportingSignalCode[] = [];

  if (input.evaluatingMemberId !== signal.ownerMemberId) {
    blockedReasons.push("owner_mismatch");
  }
  if (!signal.enrollmentId) {
    blockedReasons.push("no_active_enrollment");
  }
  if (signal.outcomeStatus === "worsening") {
    blockedReasons.push("outcome_worsening");
  }
  if (
    signal.outcomeStatus === "mixed" &&
    (signal.bodyQualityFlags.includes("muscle_loss_meaningful") ||
      signal.bodyQualityFlags.includes("weight_down_fake_success_risk"))
  ) {
    blockedReasons.push("outcome_mixed_muscle_loss");
  }
  if (signal.attentionTier === "coach_attention" || signal.finalInterventionLevel === "coach_attention") {
    blockedReasons.push("coach_attention_active");
  }
  if (isStruggleActive(signal)) {
    blockedReasons.push("struggle_active");
  }
  if (signal.customerConfirmed.class === "explicit_struggle") {
    blockedReasons.push("explicit_dissatisfaction");
  }

  const majorBreakthrough = detectMajorBreakthrough(signal, prior);
  if (majorBreakthrough) supportingSignals.push("major_breakthrough");

  const declinedActive =
    Boolean(input.recentDeclinedAt) ||
    prior.some((row) => {
      if (row.status !== "declined") return false;
      const ms = Date.parse(row.updatedAt);
      return !Number.isNaN(ms) && asOfMs - ms < REFERRAL_OPPORTUNITY_POLICY.declinedCooldownMs;
    });
  if (declinedActive) {
    blockedReasons.push("declined_active");
  }

  const askOrActedRecent =
    Boolean(input.recentAskAt && !Number.isNaN(Date.parse(input.recentAskAt)) && asOfMs - Date.parse(input.recentAskAt!) < REFERRAL_OPPORTUNITY_POLICY.askRecentMs) ||
    prior.some((row) => {
      if (row.status !== "acted") return false;
      const ms = Date.parse(row.updatedAt);
      return !Number.isNaN(ms) && asOfMs - ms < REFERRAL_OPPORTUNITY_POLICY.actedCooldownMs;
    });
  if (askOrActedRecent && !majorBreakthrough) {
    blockedReasons.push("ask_recent");
    blockedReasons.push("cooldown_active");
  } else if (
    cooldownActive({
      asOfMs,
      prior,
      recentAskAt: input.recentAskAt,
      recentDeclinedAt: input.recentDeclinedAt,
      majorBreakthrough,
    }) &&
    !declinedActive
  ) {
    blockedReasons.push("cooldown_active");
  }

  // Path evaluation (ignore blocks for computing raw readiness; blocks gate shouldOpen)
  let readiness: ReferralReadinessLevel = "not_ready";
  let pathway: ReferralOpportunityEvaluation["pathway"] = "none";

  const pathAEligible =
    signal.outcomeStatus === "improving" &&
    (signal.measurementStage === "comparison_available" || signal.measurementStage === "trend_available");

  const recomposition = signal.bodyQualityFlags.includes("recomposition");
  const pathB = signal.customerConfirmed.qualifiesPathB;
  const intent = signal.customerConfirmed.class === "explicit_referral_intent";
  const satisfaction = signal.customerConfirmed.class === "explicit_satisfaction";
  const explicitPositive = signal.customerConfirmed.class === "explicit_positive_experience";

  if (signal.customerConfirmed.class === "implicit_positive" && !pathAEligible && !pathB) {
    // vague alone
    if (!blockedReasons.includes("vague_positive_only")) {
      // only add as informational when it would have been the only path
    }
  }

  if (intent) {
    readiness = maxReadiness(readiness, "strong");
    pathway = "explicit_intent";
    supportingSignals.push("explicit_referral_intent");
    supportingSignals.push("path_b_customer_confirmed");
  } else if (pathAEligible && (satisfaction || explicitPositive)) {
    readiness = maxReadiness(readiness, "strong");
    pathway = "measured_and_customer_confirmed";
    supportingSignals.push("path_a_measured_improving");
    supportingSignals.push("path_b_customer_confirmed");
    if (satisfaction) supportingSignals.push("explicit_satisfaction");
  } else if (pathAEligible) {
    supportingSignals.push("path_a_measured_improving");
    if (signal.measurementStage === "trend_available" || recomposition) {
      readiness = maxReadiness(readiness, "strong");
      pathway = "measured";
      supportingSignals.push("path_a_trend_or_recomposition");
    } else {
      readiness = maxReadiness(readiness, "emerging");
      pathway = "measured";
    }
  } else if (pathB) {
    // customer-confirmed only → emerging max (intent already handled)
    readiness = maxReadiness(readiness, "emerging");
    pathway = "customer_confirmed";
    supportingSignals.push("path_b_customer_confirmed");
    if (satisfaction) supportingSignals.push("explicit_satisfaction");
  }

  if (input.executionStable && readiness !== "not_ready") {
    supportingSignals.push("execution_support");
  }

  // Baseline / insufficient without path B
  if (
    (signal.measurementStage === "baseline_only" || signal.outcomeStatus === "not_yet_measurable") &&
    !pathB &&
    !intent
  ) {
    blockedReasons.push("baseline_only_without_customer_confirmed");
    readiness = "not_ready";
    pathway = "none";
  }
  if (signal.outcomeStatus === "insufficient_data" && !pathB && !intent) {
    blockedReasons.push("insufficient_data_without_customer_confirmed");
    readiness = "not_ready";
    pathway = "none";
  }

  // Vague positive alone
  if (
    signal.customerConfirmed.class === "implicit_positive" &&
    readiness === "not_ready" &&
    !pathAEligible
  ) {
    blockedReasons.push("vague_positive_only");
  }

  // Hard blocks force not_ready for opening (except we keep celebration on signal)
  const hardBlocks = new Set(blockedReasons);
  const blockingForOpen = [
    "owner_mismatch",
    "no_active_enrollment",
    "outcome_worsening",
    "outcome_mixed_muscle_loss",
    "struggle_active",
    "coach_attention_active",
    "explicit_dissatisfaction",
    "declined_active",
    "cooldown_active",
    "ask_recent",
    "baseline_only_without_customer_confirmed",
    "insufficient_data_without_customer_confirmed",
    "vague_positive_only",
  ] as const;

  const hasHardBlock = blockingForOpen.some((code) => hardBlocks.has(code));
  const gatedReadiness: ReferralReadinessLevel = hasHardBlock ? "not_ready" : readiness;
  const gatedPathway = hasHardBlock ? "none" : pathway;

  const fingerprint = buildReferralOpportunityFingerprint({
    outcomeSignal: signal,
    pathway: gatedPathway === "none" ? pathway : gatedPathway,
    readiness: hasHardBlock ? readiness : gatedReadiness,
  });

  const duplicateOpen = prior.some(
    (row) => row.fingerprint === fingerprint && (row.status === "open" || row.status === "snoozed"),
  );
  // Informational only — reconcile updates same fingerprint instead of inserting.
  if (duplicateOpen) {
    blockedReasons.push("duplicate_open");
  }

  const shouldOpen =
    !hasHardBlock && (gatedReadiness === "emerging" || gatedReadiness === "strong");

  return {
    readiness: hasHardBlock ? "not_ready" : gatedReadiness,
    celebrationClass: signal.celebrationClass,
    blockedReasons: [...new Set(blockedReasons)],
    supportingSignals: [...new Set(supportingSignals)],
    pathway: hasHardBlock ? "none" : gatedPathway,
    fingerprint,
    shouldOpen,
    majorBreakthrough,
    outcomeSignal: signal,
  };
}
