import { createHash } from "node:crypto";
import { evaluateReferralOpportunity } from "@/lib/coaching/referral/evaluate-referral-opportunity";
import type { OutcomeSignal, ReferralOpportunityRecord } from "@/types/coaching-referral";
import {
  EXPERIENCE_CHECKIN_POLICY,
  type CustomerExperienceCheckin,
  type ExperienceBand,
  type GrowthMatrixResult,
  type GrowthPath,
  type OutcomeBand,
} from "@/types/coaching-growth";

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function deriveOutcomeBand(signal: OutcomeSignal): OutcomeBand {
  if (
    signal.outcomeStatus === "worsening" ||
    (signal.outcomeStatus === "mixed" &&
      (signal.bodyQualityFlags.includes("muscle_loss_meaningful") ||
        signal.bodyQualityFlags.includes("weight_down_fake_success_risk")))
  ) {
    return "blocked";
  }
  if (
    signal.outcomeStatus === "improving" &&
    (signal.measurementStage === "trend_available" || signal.bodyQualityFlags.includes("recomposition"))
  ) {
    return "high";
  }
  if (
    signal.outcomeStatus === "improving" &&
    (signal.measurementStage === "comparison_available" || signal.measurementStage === "trend_available")
  ) {
    return "mid";
  }
  return "low";
}

export function deriveExperienceBand(
  checkin: CustomerExperienceCheckin | null,
  signal: OutcomeSignal,
): ExperienceBand {
  if (checkin?.struggleFlag || signal.customerConfirmed.class === "explicit_struggle") {
    return "struggle";
  }
  if (!checkin) {
    return "unknown";
  }

  const axes = [
    checkin.outcomePerception,
    checkin.coachHelpfulness,
    checkin.experienceSatisfaction,
  ].filter((v): v is number => v != null);

  if (axes.some((v) => v <= EXPERIENCE_CHECKIN_POLICY.lowAxisMax)) {
    return "low";
  }
  if (
    (checkin.outcomePerception ?? 0) >= EXPERIENCE_CHECKIN_POLICY.highPerceptionMin &&
    (checkin.experienceSatisfaction ?? 0) >= EXPERIENCE_CHECKIN_POLICY.highSatisfactionMin &&
    (checkin.recommendationWillingness ?? -1) >= EXPERIENCE_CHECKIN_POLICY.highWillingnessMin
  ) {
    return "high";
  }
  if (axes.length > 0 || checkin.recommendationWillingness != null) {
    return "mid";
  }
  return "unknown";
}

function buildGrowthFingerprint(input: {
  signal: OutcomeSignal;
  outcomeBand: OutcomeBand;
  experienceBand: ExperienceBand;
  readiness: string;
  pathway: string;
  primaryPath: GrowthPath | null;
  checkinId: string | null;
}): string {
  const snapshot = {
    customerId: input.signal.customerId,
    enrollmentId: input.signal.enrollmentId,
    pathway: input.pathway,
    readiness: input.readiness,
    outcomeStatus: input.signal.outcomeStatus,
    measurementStage: input.signal.measurementStage,
    bodyQualityFlags: [...input.signal.bodyQualityFlags].sort(),
    customerConfirmedClass: input.signal.customerConfirmed.class,
    confirmedPatterns: [...input.signal.customerConfirmed.matchedPatterns].sort(),
    latestMeasurementId: input.signal.latestMeasurementId,
    baselineMeasurementId: input.signal.baselineMeasurementId,
    outcomeBand: input.outcomeBand,
    experienceBand: input.experienceBand,
    primaryGrowthPath: input.primaryPath,
    checkinId: input.checkinId,
  };
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

function selectPaths(input: {
  outcomeBand: OutcomeBand;
  experienceBand: ExperienceBand;
  readiness: string;
  checkin: CustomerExperienceCheckin | null;
  signal: OutcomeSignal;
  repairExperience: boolean;
  blocked: boolean;
}): { primary: GrowthPath | null; secondary: GrowthPath[] } {
  if (input.blocked || input.repairExperience || input.readiness === "not_ready") {
    return { primary: null, secondary: [] };
  }

  const intent =
    input.checkin?.explicitReferralIntent === true ||
    input.signal.customerConfirmed.class === "explicit_referral_intent";

  const shareOk = input.checkin?.mostFeltChangeConsent === "share_ok";
  const willingness = input.checkin?.recommendationWillingness ?? null;
  const eligible = new Set<GrowthPath>();

  if (intent) {
    return { primary: "coach_assisted_referral", secondary: [] };
  }

  if (
    input.outcomeBand === "high" &&
    (input.experienceBand === "mid" || input.experienceBand === "high") &&
    shareOk &&
    willingness != null &&
    willingness >= EXPERIENCE_CHECKIN_POLICY.socialProofWillingnessMin
  ) {
    eligible.add("social_proof");
  }

  if (
    input.experienceBand === "high" &&
    (input.outcomeBand === "low" || input.outcomeBand === "mid")
  ) {
    eligible.add("friend_benefit");
  }

  if (
    (input.outcomeBand === "mid" || input.outcomeBand === "high") &&
    (input.experienceBand === "mid" || input.experienceBand === "high")
  ) {
    eligible.add("coach_assisted_referral");
  }

  if (input.outcomeBand === "high" && input.experienceBand === "high") {
    eligible.add("coach_assisted_referral");
    if (shareOk) eligible.add("social_proof");
  }

  // Friend benefit prep when high exp + low outcome already handled; also soft when high exp only
  if (input.experienceBand === "high" && input.outcomeBand === "low") {
    eligible.add("friend_benefit");
  }

  const list = [...eligible];
  if (list.length === 0) return { primary: null, secondary: [] };

  let primary: GrowthPath;
  if (list.includes("coach_assisted_referral") && input.outcomeBand === "high" && input.experienceBand === "high") {
    primary = "coach_assisted_referral";
  } else if (list.includes("social_proof")) {
    primary = "social_proof";
  } else if (list.includes("friend_benefit")) {
    primary = "friend_benefit";
  } else {
    primary = list[0]!;
  }

  return { primary, secondary: list.filter((p) => p !== primary) };
}

/**
 * Deterministic Growth Matrix — no single Referral Score.
 */
export function evaluateGrowthMatrix(input: {
  outcomeSignal: OutcomeSignal;
  evaluatingMemberId: string;
  checkin?: CustomerExperienceCheckin | null;
  priorOpportunities?: ReferralOpportunityRecord[];
  recentAskAt?: string | null;
  recentDeclinedAt?: string | null;
  asOfIso?: string;
  executionStable?: boolean;
}): GrowthMatrixResult {
  const signal = input.outcomeSignal;
  const checkin = input.checkin ?? null;
  const outcomeBand = deriveOutcomeBand(signal);
  const experienceBand = deriveExperienceBand(checkin, signal);

  // Experience authority overrides vague heuristic Path B when check-in exists
  const effectiveSignal: OutcomeSignal = { ...signal };
  if (checkin) {
    if (checkin.struggleFlag) {
      effectiveSignal.customerConfirmed = {
        class: "explicit_struggle",
        matchedPatterns: ["checkin_struggle_flag"],
        rawExcerpt: checkin.mostFeltChangeText,
        qualifiesPathB: false,
      };
    } else if (checkin.explicitReferralIntent) {
      effectiveSignal.customerConfirmed = {
        class: "explicit_referral_intent",
        matchedPatterns: ["checkin_explicit_referral_intent"],
        rawExcerpt: checkin.mostFeltChangeText,
        qualifiesPathB: true,
      };
    } else if (experienceBand === "low") {
      // Low check-in blocks heuristic Path B upgrade
      effectiveSignal.customerConfirmed = {
        class: "none",
        matchedPatterns: ["checkin_overrides_heuristic"],
        rawExcerpt: checkin.mostFeltChangeText,
        qualifiesPathB: false,
      };
    } else if (
      experienceBand === "high" ||
      experienceBand === "mid"
    ) {
      // Structured positive experience — treat as satisfaction for Path B when mid/high
      if (
        (checkin.outcomePerception ?? 0) >= EXPERIENCE_CHECKIN_POLICY.highPerceptionMin ||
        (checkin.experienceSatisfaction ?? 0) >= EXPERIENCE_CHECKIN_POLICY.highSatisfactionMin
      ) {
        effectiveSignal.customerConfirmed = {
          class:
            (checkin.recommendationWillingness ?? 0) >= EXPERIENCE_CHECKIN_POLICY.highWillingnessMin
              ? "explicit_satisfaction"
              : "explicit_positive_experience",
          matchedPatterns: ["checkin_structured"],
          rawExcerpt: checkin.mostFeltChangeText,
          qualifiesPathB: true,
        };
      }
    }
  }

  const referral = evaluateReferralOpportunity({
    outcomeSignal: effectiveSignal,
    evaluatingMemberId: input.evaluatingMemberId,
    priorOpportunities: input.priorOpportunities,
    recentAskAt: input.recentAskAt,
    recentDeclinedAt: input.recentDeclinedAt ?? (checkin?.declineGrowthAsk ? checkin.respondedAt : null),
    asOfIso: input.asOfIso,
    executionStable: input.executionStable,
  });

  const blockedReasons = [...referral.blockedReasons];
  let readiness = referral.readiness;
  let shouldOpen = referral.shouldOpen;
  let pathway = referral.pathway;
  let repairExperience = false;
  let inviteCheckin = false;

  if (
    (outcomeBand === "high" || outcomeBand === "mid") &&
    (experienceBand === "low" || experienceBand === "struggle")
  ) {
    repairExperience = outcomeBand === "high";
    readiness = "not_ready";
    shouldOpen = false;
    pathway = "none";
    if (!blockedReasons.includes("explicit_dissatisfaction") && experienceBand === "struggle") {
      blockedReasons.push("explicit_dissatisfaction");
    }
    if (!blockedReasons.includes("struggle_active")) {
      blockedReasons.push("struggle_active");
    }
  }

  if (outcomeBand === "high" && experienceBand === "unknown" && !checkin) {
    inviteCheckin = true;
    // Cap at emerging without check-in for high outcome (GE-01)
    if (readiness === "strong" && signal.customerConfirmed.class !== "explicit_referral_intent") {
      readiness = "emerging";
    }
  }

  if (outcomeBand === "blocked") {
    readiness = "not_ready";
    shouldOpen = false;
    pathway = "none";
  }

  if (checkin?.declineGrowthAsk) {
    blockedReasons.push("declined_active");
    readiness = "not_ready";
    shouldOpen = false;
    pathway = "none";
  }

  // Low outcome + high exp: allow friend_benefit emerging only (not measured success referral)
  if (outcomeBand === "low" && experienceBand === "high" && !repairExperience) {
    if (signal.customerConfirmed.class !== "explicit_referral_intent" && !checkin?.explicitReferralIntent) {
      // friend benefit path selected below; keep emerging if check-in qualifies
      if (readiness === "strong") readiness = "emerging";
      if (pathway === "measured" || pathway === "measured_and_customer_confirmed") {
        pathway = "customer_confirmed";
      }
    }
  }

  const blocked =
    readiness === "not_ready" ||
    blockedReasons.some((code) =>
      [
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
      ].includes(code),
    );

  // Re-open shouldOpen after matrix adjustments
  shouldOpen =
    !blocked &&
    !repairExperience &&
    (readiness === "emerging" || readiness === "strong");

  let { primary, secondary } = selectPaths({
    outcomeBand,
    experienceBand,
    readiness,
    checkin,
    signal: effectiveSignal,
    repairExperience,
    blocked: !shouldOpen,
  });

  if (shouldOpen && !primary) {
    if (outcomeBand === "high" && experienceBand === "high") {
      primary = "coach_assisted_referral";
    } else if (outcomeBand === "low" && experienceBand === "high") {
      primary = "friend_benefit";
    }
  }

  const primaryGrowthPath = shouldOpen ? primary : null;
  const secondaryEligiblePaths = shouldOpen ? secondary.filter((p) => p !== primaryGrowthPath) : [];

  const fingerprint = buildGrowthFingerprint({
    signal: effectiveSignal,
    outcomeBand,
    experienceBand,
    readiness,
    pathway,
    primaryPath: primaryGrowthPath,
    checkinId: checkin?.id ?? null,
  });

  const whyEvidence: string[] = [];
  whyEvidence.push(`measured_outcome=${signal.outcomeStatus}/${signal.measurementStage}→${outcomeBand}`);
  whyEvidence.push(`experience=${experienceBand}${checkin ? `(checkin:${checkin.id})` : "(no_checkin)"}`);
  if (checkin) {
    whyEvidence.push(
      `scales: perception=${checkin.outcomePerception ?? "—"} helpfulness=${checkin.coachHelpfulness ?? "—"} satisfaction=${checkin.experienceSatisfaction ?? "—"} willingness=${checkin.recommendationWillingness ?? "—"}`,
    );
    if (checkin.mostFeltChangeText) {
      whyEvidence.push(`felt_change=${checkin.mostFeltChangeText.slice(0, 80)}`);
    }
  } else if (signal.customerConfirmed.class !== "none") {
    whyEvidence.push(`heuristic=${signal.customerConfirmed.class}`);
  }
  if (repairExperience) whyEvidence.push("repair_experience_required");
  if (inviteCheckin) whyEvidence.push("invite_checkin_before_strong");
  if (primaryGrowthPath) whyEvidence.push(`primary_path=${primaryGrowthPath}`);
  if (blockedReasons.length) whyEvidence.push(`blocks=${blockedReasons.join(",")}`);

  return {
    outcomeBand,
    experienceBand,
    readiness: shouldOpen ? readiness : "not_ready",
    blockedReasons: [...new Set(blockedReasons)],
    supportingSignals: referral.supportingSignals,
    primaryGrowthPath,
    secondaryEligiblePaths,
    celebrationClass: signal.celebrationClass,
    pathway: shouldOpen ? pathway : "none",
    fingerprint,
    shouldOpen,
    majorBreakthrough: referral.majorBreakthrough,
    repairExperience,
    inviteCheckin,
    outcomeSignal: effectiveSignal,
    checkinId: checkin?.id ?? null,
    whyEvidence,
  };
}
