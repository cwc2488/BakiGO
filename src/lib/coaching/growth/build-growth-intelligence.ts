import { assessCoachingOutcome } from "@/lib/coaching/ai/assess-coaching-outcome";
import { buildOutcomeMemoryForProgress } from "@/lib/coaching/ai/build-outcome-memory";
import { buildOutcomeSignal } from "@/lib/coaching/referral/build-outcome-signal";
import { evaluateGrowthMatrix } from "@/lib/coaching/growth/evaluate-growth-matrix";
import type { CustomerExperienceCheckin, GrowthMatrixResult } from "@/types/coaching-growth";
import type { CoachingEnrollment } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";
import type { CoachingAttentionTier } from "@/types/coaching-attention";
import type { ReferralOpportunityRecord } from "@/types/coaching-referral";

function daysBetween(left: string, right: string): number {
  const start = new Date(`${left}T00:00:00.000Z`);
  const end = new Date(`${right}T00:00:00.000Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

function assessForGrowth(input: {
  goal: string | null;
  outcomeMemory: ReturnType<typeof buildOutcomeMemoryForProgress>;
  logDate: string;
  daysSinceEnrollmentStart: number;
}) {
  const generationInput = {
    profileMemory: {
      displayName: "",
      goal: input.goal,
      daysSinceEnrollmentStart: input.daysSinceEnrollmentStart,
      planSnapshot: {
        version: 1 as const,
        dietaryGuidelines: [],
        dailyInstructions: {
          wakeUp: [],
          breakfast: [],
          lunch: [],
          dinner: [],
          snacks: [],
          hydration: [],
          sleep: [],
        },
        reportingRules: [],
      },
      customerContext: { heightCm: null, sex: null, region: null, occupation: null },
      baselineMeasurement: input.outcomeMemory.baselineMeasurement,
    },
    rollingMemory: {
      windowDays: 14,
      aggregates: {
        windowDays: 14,
        daysWithReport: 0,
        daysSubmitted: 0,
        mealReportRate: 0,
        breakfastCompletionRate: 0,
        lunchCompletionRate: 0,
        dinnerCompletionRate: 0,
        averageWaterMl: 0,
        averageSleepDurationMinutes: 0,
        lateSleepDays: 0,
        exerciseDays: 0,
        bowelMovementSummary: { daysReported: 0, totalCount: 0, averagePerDay: 0 },
      },
      recentDays: [],
      recurringPatterns: [],
    },
    outcomeMemory: input.outcomeMemory,
    logDate: input.logDate,
    todayContext: { customerNote: null },
  };
  return assessCoachingOutcome({ generationInput: generationInput as never });
}

export function buildGrowthIntelligence(input: {
  enrollment: Pick<CoachingEnrollment, "id" | "customerId" | "ownerMemberId" | "goal" | "startedAt" | "baselineBodyRecordId">;
  ownerMemberId: string;
  bodyRecords: BodyCompositionRecord[];
  logDate: string;
  checkin: CustomerExperienceCheckin | null;
  attentionTier: CoachingAttentionTier;
  attentionReasonCodes?: string[];
  finalInterventionLevel: "normal" | "watch" | "coach_attention";
  customerNote?: string | null;
  priorOpportunities?: ReferralOpportunityRecord[];
  recentAskAt?: string | null;
  recentDeclinedAt?: string | null;
  asOfIso?: string;
}): GrowthMatrixResult {
  const daysSinceEnrollmentStart = daysBetween(input.enrollment.startedAt.slice(0, 10), input.logDate);
  const outcomeMemory = buildOutcomeMemoryForProgress({
    bodyRecords: input.bodyRecords,
    baselineBodyRecordId: input.enrollment.baselineBodyRecordId,
  });
  const outcomeAssessment = assessForGrowth({
    goal: input.enrollment.goal,
    outcomeMemory,
    logDate: input.logDate,
    daysSinceEnrollmentStart,
  });

  const outcomeSignal = buildOutcomeSignal({
    customerId: input.enrollment.customerId,
    enrollmentId: input.enrollment.id,
    ownerMemberId: input.ownerMemberId,
    asOfLogDate: input.logDate,
    outcomeAssessment,
    attentionTier: input.attentionTier,
    attentionReasonCodes: input.attentionReasonCodes ?? [],
    finalInterventionLevel: input.finalInterventionLevel,
    daysSinceEnrollmentStart,
    latestMeasurementId: null,
    baselineMeasurementId: null,
    customerNote: input.customerNote,
  });

  return evaluateGrowthMatrix({
    outcomeSignal,
    evaluatingMemberId: input.ownerMemberId,
    checkin: input.checkin,
    priorOpportunities: input.priorOpportunities,
    recentAskAt: input.recentAskAt,
    recentDeclinedAt: input.recentDeclinedAt,
    asOfIso: input.asOfIso,
  });
}

export function growthPathLabel(path: string | null): string {
  if (path === "coach_assisted_referral") return "教練協助轉介紹";
  if (path === "social_proof") return "成果分享";
  if (path === "friend_benefit") return "好友體驗邀請";
  return "尚無建議路徑";
}

export function readinessLabel(readiness: string): string {
  if (readiness === "strong") return "適合談（強）";
  if (readiness === "emerging") return "可開始觀察／輕談";
  return "現在不適合談";
}

export function bandLabel(band: string): string {
  const map: Record<string, string> = {
    blocked: "受阻",
    low: "偏低",
    mid: "中等",
    high: "偏高",
    unknown: "尚未回饋",
    struggle: "卡住／低落",
  };
  return map[band] ?? band;
}
