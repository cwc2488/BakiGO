import {
  assessCoachingOutcome,
  buildGoalContext,
} from "@/lib/coaching/ai/assess-coaching-outcome";
import { buildOutcomeMemoryForProgress } from "@/lib/coaching/ai/build-outcome-memory";
import {
  formatMeasurementStageLabel,
  formatOutcomeStatusLabel,
  formatTrendStatusLabel,
} from "@/lib/coaching/presentation/coaching-ui-copy";
import type { CoachingEnrollment } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";
import type {
  CoachingMeasurementStage,
  CoachingOutcomeStatus,
  CoachingTrendStatus,
} from "@/types/coaching-signals";

export type CoachingProgressMetricRow = {
  key: string;
  label: string;
  unit: string;
  baseline: number | null;
  latest: number | null;
  delta: number | null;
};

export type CoachingProgressView = {
  dayNumber: number | null;
  dayTotal: 90;
  goalLabel: string;
  measurementStage: CoachingMeasurementStage;
  measurementStageLabel: string;
  outcomeStatus: CoachingOutcomeStatus;
  outcomeStatusLabel: string;
  trendStatus: CoachingTrendStatus;
  trendStatusLabel: string;
  baselineDate: string | null;
  latestDate: string | null;
  daysSinceLatestMeasurement: number | null;
  metrics: CoachingProgressMetricRow[];
  customerSummary: string;
  waitingForRetest: boolean;
  baselineMissing: boolean;
};

function daysBetween(left: string, right: string): number {
  const start = new Date(`${left}T00:00:00.000Z`);
  const end = new Date(`${right}T00:00:00.000Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export function buildCoachingProgressView(input: {
  enrollment: Pick<CoachingEnrollment, "goal" | "startedAt" | "baselineBodyRecordId">;
  bodyRecords: BodyCompositionRecord[];
  logDate: string;
}): CoachingProgressView {
  const outcomeMemory = buildOutcomeMemoryForProgress({
    bodyRecords: input.bodyRecords,
    baselineBodyRecordId: input.enrollment.baselineBodyRecordId,
  });
  const daysSinceEnrollmentStart = daysBetween(input.enrollment.startedAt.slice(0, 10), input.logDate);
  const goalContext = buildGoalContext({
    goal: input.enrollment.goal,
    outcomeMemory,
    logDate: input.logDate,
    daysSinceEnrollmentStart,
  });

  // Lightweight assessment without full generation input.
  let outcomeStatus: CoachingOutcomeStatus = "insufficient_data";
  let trendStatus: CoachingTrendStatus = "not_applicable";
  let customerSummary = "尚未建立起始量測。";

  if (!outcomeMemory.baselineMeasurement) {
    outcomeStatus = "insufficient_data";
    customerSummary = "尚未建立起始量測。教練端可補上 baseline 後再開始比較身體變化。";
  } else if (goalContext.measurementStage === "baseline_only") {
    outcomeStatus = "not_yet_measurable";
    customerSummary =
      "目前已有起始量測，尚未進行第二次回測。現在先累積每日執行資料，下一次量測後就能開始比較身體變化。";
  } else {
    const fakeInput = {
      profileMemory: {
        goal: input.enrollment.goal,
        daysSinceEnrollmentStart,
      },
      outcomeMemory,
      logDate: input.logDate,
      rollingMemory: null,
    };
    // Reuse assess via thin wrapper below
    const assessed = assessProgressOutcome({
      goal: input.enrollment.goal,
      outcomeMemory,
      logDate: input.logDate,
      daysSinceEnrollmentStart,
    });
    outcomeStatus = assessed.outcomeStatus;
    trendStatus = assessed.trendStatus;
    customerSummary = assessed.customerSummary;
    void fakeInput;
  }

  const metricDefs = [
    { key: "weightKg", label: "體重", unit: "kg", pick: (m: typeof outcomeMemory.baselineMeasurement) => m?.weightKg ?? null },
    { key: "bodyFatPercent", label: "體脂", unit: "%", pick: (m: typeof outcomeMemory.baselineMeasurement) => m?.bodyFatPercent ?? null },
    { key: "skeletalMuscleKg", label: "肌肉", unit: "kg", pick: (m: typeof outcomeMemory.baselineMeasurement) => m?.skeletalMuscleKg ?? null },
    { key: "visceralFatLevel", label: "內臟脂肪", unit: "", pick: (m: typeof outcomeMemory.baselineMeasurement) => m?.visceralFatLevel ?? null },
  ] as const;

  const metrics: CoachingProgressMetricRow[] = metricDefs.map((def) => {
    const baseline = def.pick(outcomeMemory.baselineMeasurement);
    const latest =
      goalContext.measurementStage === "baseline_only"
        ? null
        : def.pick(outcomeMemory.latestMeasurement);
    const delta =
      baseline != null && latest != null ? Math.round((latest - baseline) * 10) / 10 : null;
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      baseline,
      latest,
      delta,
    };
  });

  return {
    dayNumber: daysSinceEnrollmentStart + 1,
    dayTotal: 90,
    goalLabel: goalContext.goalLabel,
    measurementStage: goalContext.measurementStage,
    measurementStageLabel: formatMeasurementStageLabel(goalContext.measurementStage),
    outcomeStatus,
    outcomeStatusLabel: formatOutcomeStatusLabel(outcomeStatus),
    trendStatus,
    trendStatusLabel: formatTrendStatusLabel(trendStatus),
    baselineDate: goalContext.baselineDate,
    latestDate: goalContext.latestMeasurementDate,
    daysSinceLatestMeasurement: goalContext.daysSinceLatestMeasurement,
    metrics,
    customerSummary,
    waitingForRetest: goalContext.measurementStage === "baseline_only" && Boolean(outcomeMemory.baselineMeasurement),
    baselineMissing: !outcomeMemory.baselineMeasurement,
  };
}

function assessProgressOutcome(input: {
  goal: string | null;
  outcomeMemory: ReturnType<typeof buildOutcomeMemoryForProgress>;
  logDate: string;
  daysSinceEnrollmentStart: number;
}): { outcomeStatus: CoachingOutcomeStatus; trendStatus: CoachingTrendStatus; customerSummary: string } {
  // Import cycle-safe: call assessCoachingOutcome with a minimal generation-shaped object.
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
        mealReportRate: null,
        breakfastCompletionRate: null,
        lunchCompletionRate: null,
        dinnerCompletionRate: null,
        averageWaterMl: null,
        averageSleepDurationMinutes: null,
        lateSleepDays: 0,
        exerciseDays: 0,
        bowelMovementSummary: { daysReported: 0, totalCount: 0, averagePerDay: null },
      },
      recentDays: [],
      recurringPatterns: [],
    },
    outcomeMemory: input.outcomeMemory,
    coachDirectives: null,
    todayContext: {
      logDate: input.logDate,
      submitted: true,
      primaryMeals: [],
      secondaryMealNotes: [],
      waterMl: null,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationMinutes: null,
      sleepDurationLabel: null,
      exerciseNote: null,
      bowelMovementCount: null,
      customerNote: null,
    },
    priorAiContext: null,
    interventionContext: {
      finalInterventionLevel: "normal" as const,
      reasons: [],
      provenance: "deterministic" as const,
    },
    version: 1 as const,
    builtAt: `${input.logDate}T00:00:00.000Z`,
    logDate: input.logDate,
    enrollmentId: "progress-view",
    customerId: "progress-view",
  };

  const assessed = assessCoachingOutcome({ generationInput: generationInput as never });
  return {
    outcomeStatus: assessed.outcomeStatus,
    trendStatus: assessed.trendStatus,
    customerSummary: assessed.customerSummary,
  };
}
