import type { CoachingAttentionTier } from "@/types/coaching-attention";
import type {
  CoachingMeasurementStage,
  CoachingOutcomeAssessment,
  CoachingOutcomeStatus,
} from "@/types/coaching-signals";
import type {
  OutcomeSignal,
  OutcomeSignalBodyQualityFlag,
  ReferralCelebrationClass,
} from "@/types/coaching-referral";
import { extractCustomerConfirmedExperience } from "@/lib/coaching/referral/extract-customer-confirmed-experience";

export type BuildOutcomeSignalInput = {
  customerId: string;
  enrollmentId: string | null;
  ownerMemberId: string;
  asOfLogDate: string;
  outcomeAssessment: CoachingOutcomeAssessment;
  attentionTier: CoachingAttentionTier;
  attentionReasonCodes: string[];
  finalInterventionLevel: "normal" | "watch" | "coach_attention";
  daysSinceEnrollmentStart: number;
  latestMeasurementId?: string | null;
  baselineMeasurementId?: string | null;
  /** Customer-authored note only. */
  customerNote?: string | null;
  executionStable?: boolean;
};

function deriveBodyQualityFlags(assessment: CoachingOutcomeAssessment): OutcomeSignalBodyQualityFlag[] {
  const flags: OutcomeSignalBodyQualityFlag[] = [];
  const blob = [...assessment.reasons, ...assessment.evidence.map((item) => `${item.key}=${item.value}`)].join(
    "\n",
  );
  if (/肌肉流失/.test(blob)) flags.push("muscle_loss_meaningful");
  if (/正向身體重組|體脂下降且肌肉上升/.test(blob)) flags.push("recomposition");
  if (/體脂.*改善|體脂下降|體脂有改善/.test(blob)) flags.push("bf_improved");
  if (
    assessment.outcomeStatus === "mixed" &&
    flags.includes("muscle_loss_meaningful") &&
    /不能只看成減脂成功|肌肉流失/.test(blob)
  ) {
    flags.push("weight_down_fake_success_risk");
  }
  return flags;
}

function deriveCelebrationClass(input: {
  outcomeStatus: CoachingOutcomeStatus;
  measurementStage: CoachingMeasurementStage;
  bodyQualityFlags: OutcomeSignalBodyQualityFlag[];
  customerConfirmedClass: string;
  executionStable: boolean;
}): ReferralCelebrationClass {
  if (input.outcomeStatus === "worsening" || input.outcomeStatus === "insufficient_data") {
    return "none";
  }
  if (input.measurementStage === "baseline_only" || input.outcomeStatus === "not_yet_measurable") {
    if (
      input.customerConfirmedClass === "explicit_satisfaction" ||
      input.customerConfirmedClass === "explicit_positive_experience" ||
      input.customerConfirmedClass === "explicit_referral_intent"
    ) {
      return "soft";
    }
    return input.executionStable ? "soft" : "none";
  }
  if (input.bodyQualityFlags.includes("muscle_loss_meaningful") && input.outcomeStatus === "mixed") {
    return "soft";
  }
  if (input.outcomeStatus === "improving" || input.bodyQualityFlags.includes("recomposition")) {
    return "clear";
  }
  if (input.outcomeStatus === "flat" && input.executionStable) {
    return "soft";
  }
  if (input.outcomeStatus === "mixed") {
    return "soft";
  }
  return "none";
}

export function buildOutcomeSignal(input: BuildOutcomeSignalInput): OutcomeSignal {
  const assessment = input.outcomeAssessment;
  const customerConfirmed = extractCustomerConfirmedExperience(input.customerNote);
  const bodyQualityFlags = deriveBodyQualityFlags(assessment);
  const celebrationClass = deriveCelebrationClass({
    outcomeStatus: assessment.outcomeStatus,
    measurementStage: assessment.goalContext.measurementStage,
    bodyQualityFlags,
    customerConfirmedClass: customerConfirmed.class,
    executionStable: Boolean(input.executionStable),
  });

  return {
    customerId: input.customerId,
    enrollmentId: input.enrollmentId,
    ownerMemberId: input.ownerMemberId,
    asOfLogDate: input.asOfLogDate,
    measurementStage: assessment.goalContext.measurementStage,
    outcomeStatus: assessment.outcomeStatus,
    trendStatus: assessment.trendStatus,
    goalType: assessment.goalContext.goalType,
    customerSummary: assessment.customerSummary,
    evidence: assessment.evidence.map((item) => `${item.key}=${String(item.value)}`),
    bodyQualityFlags,
    attentionTier: input.attentionTier,
    attentionReasonCodes: [...input.attentionReasonCodes],
    finalInterventionLevel: input.finalInterventionLevel,
    daysSinceEnrollmentStart: input.daysSinceEnrollmentStart,
    latestMeasurementId: input.latestMeasurementId ?? null,
    baselineMeasurementId: input.baselineMeasurementId ?? null,
    customerConfirmed,
    celebrationClass,
  };
}
