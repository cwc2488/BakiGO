import { describe, expect, it } from "vitest";
import {
  assessCoachingOutcome,
  interpretFatLossOutcome,
  resolveBodyAwareInterventionLevel,
  resolveMeasurementStage,
  buildGoalContext,
  evaluateMeasurementPeriods,
} from "@/lib/coaching/ai/assess-coaching-outcome";
import { buildOutcomeMemoryForProgress } from "@/lib/coaching/ai/build-outcome-memory";
import { buildCoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { buildCoachingAiFixtureGenerationInput } from "@/lib/coaching/ai/coaching-ai-fixtures";
import { buildCoachingDecisionContext } from "@/lib/coaching/ai/coaching-signal-engine";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { BodyCompositionRecord } from "@/types/customer";
import type { CoachingEnrollment } from "@/types/coaching";
import type { CoachingBodyTrendDelta } from "@/types/coaching-ai";

function body(
  id: string,
  recordDate: string,
  values: Partial<Pick<BodyCompositionRecord, "weightKg" | "bodyFatPercent" | "skeletalMuscleKg" | "visceralFatLevel" | "bmi">>,
): BodyCompositionRecord {
  return {
    id,
    customerId: "cust",
    recordDate,
    age: null,
    weightKg: values.weightKg ?? null,
    skeletalMuscleKg: values.skeletalMuscleKg ?? null,
    bodyFatKg: null,
    bmi: values.bmi ?? null,
    bodyFatPercent: values.bodyFatPercent ?? null,
    visceralFatLevel: values.visceralFatLevel ?? null,
    basalMetabolicRate: null,
    bodyAge: null,
    createdAt: `${recordDate}T00:00:00.000Z`,
    updatedAt: `${recordDate}T00:00:00.000Z`,
  };
}

const enrollmentBase: CoachingEnrollment = {
  id: "enroll",
  customerId: "cust",
  ownerMemberId: "member",
  goal: "健康減脂",
  status: "active",
  startedAt: "2026-07-01T00:00:00.000Z",
  endedAt: null,
  onboardingCompletedAt: "2026-07-01T01:00:00.000Z",
  planSnapshot: cloneDefaultCoachingPlanSnapshot(),
  baselineBodyRecordId: "b1",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("measurement stage", () => {
  it("baseline_only when single measurement", () => {
    const memory = buildOutcomeMemoryForProgress({
      bodyRecords: [body("b1", "2026-07-01", { weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15 })],
      baselineBodyRecordId: "b1",
    });
    expect(memory.measurementCount).toBe(1);
    expect(
      resolveMeasurementStage({
        baseline: memory.baselineMeasurement,
        latest: memory.latestMeasurement,
        measurementCount: memory.measurementCount,
        daysBetweenMeasurements: memory.daysBetweenMeasurements,
      }),
    ).toBe("baseline_only");
  });

  it("comparison_available with 2 measurements", () => {
    const memory = buildOutcomeMemoryForProgress({
      bodyRecords: [
        body("b2", "2026-07-15", { weightKg: 88, bodyFatPercent: 34, skeletalMuscleKg: 30, visceralFatLevel: 14 }),
        body("b1", "2026-07-01", { weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15 }),
      ],
      baselineBodyRecordId: "b1",
    });
    expect(
      resolveMeasurementStage({
        baseline: memory.baselineMeasurement,
        latest: memory.latestMeasurement,
        measurementCount: memory.measurementCount,
        daysBetweenMeasurements: memory.daysBetweenMeasurements,
      }),
    ).toBe("comparison_available");
  });

  it("trend_available requires >=3 measurements and >=14 days span", () => {
    const memory = buildOutcomeMemoryForProgress({
      bodyRecords: [
        body("b3", "2026-07-30", { weightKg: 87, bodyFatPercent: 33, skeletalMuscleKg: 30.2, visceralFatLevel: 13 }),
        body("b2", "2026-07-15", { weightKg: 88, bodyFatPercent: 34, skeletalMuscleKg: 30, visceralFatLevel: 14 }),
        body("b1", "2026-07-01", { weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15 }),
      ],
      baselineBodyRecordId: "b1",
    });
    expect(memory.measurementCount).toBe(3);
    expect(memory.daysBetweenMeasurements).toBeGreaterThanOrEqual(14);
    expect(
      resolveMeasurementStage({
        baseline: memory.baselineMeasurement,
        latest: memory.latestMeasurement,
        measurementCount: memory.measurementCount,
        daysBetweenMeasurements: memory.daysBetweenMeasurements,
      }),
    ).toBe("trend_available");
  });
});

describe("fat-loss outcome interpretation", () => {
  it("J improving: weight down + BF down + muscle stable", () => {
    const deltas: CoachingBodyTrendDelta[] = [
      { label: "體重", baseline: 90, latest: 87.8, delta: -2.2, unit: "kg" },
      { label: "體脂率", baseline: 35, latest: 33.5, delta: -1.5, unit: "%" },
      { label: "骨骼肌", baseline: 30, latest: 30.1, delta: 0.1, unit: "kg" },
      { label: "內臟脂肪", baseline: 15, latest: 14, delta: -1, unit: "" },
    ];
    expect(interpretFatLossOutcome(deltas).status).toBe("improving");
  });

  it("K mixed: weight down + muscle loss", () => {
    const deltas: CoachingBodyTrendDelta[] = [
      { label: "體重", baseline: 90, latest: 86, delta: -4, unit: "kg" },
      { label: "體脂率", baseline: 35, latest: 34.8, delta: -0.2, unit: "%" },
      { label: "骨骼肌", baseline: 30, latest: 27.5, delta: -2.5, unit: "kg" },
    ];
    expect(interpretFatLossOutcome(deltas).status).toBe("mixed");
  });

  it("L improving recomposition despite weight up", () => {
    const deltas: CoachingBodyTrendDelta[] = [
      { label: "體重", baseline: 90, latest: 90.5, delta: 0.5, unit: "kg" },
      { label: "體脂率", baseline: 35, latest: 32, delta: -3, unit: "%" },
      { label: "骨骼肌", baseline: 30, latest: 32, delta: 2, unit: "kg" },
    ];
    expect(interpretFatLossOutcome(deltas).status).toBe("improving");
  });
});

describe("baseline-only coaching context", () => {
  it("I/M: not_yet_measurable and no fake trend", () => {
    const records = [
      body("b1", "2026-07-01", { weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15 }),
    ];
    const memory = buildOutcomeMemoryForProgress({
      bodyRecords: records,
      baselineBodyRecordId: "b1",
    });
    const goal = buildGoalContext({
      goal: "健康減脂",
      outcomeMemory: memory,
      logDate: "2026-07-11",
      daysSinceEnrollmentStart: 10,
    });
    expect(goal.measurementStage).toBe("baseline_only");
    expect(goal.goalType).toBe("fat_loss");

    const fixture = buildCoachingAiFixtureGenerationInput("E_full_day_off_track");
    const generationInput = {
      ...fixture.generationInput,
      profileMemory: {
        ...fixture.generationInput.profileMemory,
        goal: "健康減脂",
        baselineMeasurement: memory.baselineMeasurement,
        daysSinceEnrollmentStart: 10,
      },
      outcomeMemory: memory,
      logDate: "2026-07-11",
    };
    const assessed = assessCoachingOutcome({ generationInput });
    expect(assessed.outcomeStatus).toBe("not_yet_measurable");
    expect(assessed.trendStatus).toBe("not_applicable");
    expect(assessed.customerSummary).not.toMatch(/改善|惡化|沒有變|卡住/);
  });
});

describe("two-period intervention", () => {
  it("N: two flat periods with execution support can raise to watch", () => {
    const measurements = [
      { recordDate: "2026-07-01", weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15, bmi: null, bodyFatKg: null },
      { recordDate: "2026-07-15", weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15, bmi: null, bodyFatKg: null },
      { recordDate: "2026-07-30", weightKg: 90.1, bodyFatPercent: 35.1, skeletalMuscleKg: 30, visceralFatLevel: 15, bmi: null, bodyFatKg: null },
    ];
    const periods = evaluateMeasurementPeriods({ measurements, goalType: "fat_loss" });
    expect(periods.length).toBe(2);
    const resolved = resolveBodyAwareInterventionLevel({
      baseLevel: "normal",
      measurementStage: "trend_available",
      outcomeStatus: "flat",
      periods,
      rollingMemory: {
        windowDays: 14,
        aggregates: {
          windowDays: 14,
          daysWithReport: 10,
          daysSubmitted: 10,
          mealReportRate: 0.6,
          breakfastCompletionRate: 0.4,
          lunchCompletionRate: 0.8,
          dinnerCompletionRate: 0.8,
          averageWaterMl: 1500,
          averageSleepDurationMinutes: 400,
          lateSleepDays: 3,
          exerciseDays: 2,
          bowelMovementSummary: { daysReported: 5, totalCount: 5, averagePerDay: 1 },
        },
        recentDays: [],
        recurringPatterns: ["late_sleep_pattern"],
      },
    });
    expect(resolved.finalInterventionLevel).toBe("watch");
  });

  it("first comparison period observes first", () => {
    const resolved = resolveBodyAwareInterventionLevel({
      baseLevel: "normal",
      measurementStage: "comparison_available",
      outcomeStatus: "flat",
      periods: [{ status: "flat" }],
      rollingMemory: null,
    });
    expect(resolved.finalInterventionLevel).toBe("normal");
    expect(resolved.reasons.join(" ")).toMatch(/observe first/);
  });
});

describe("progress view", () => {
  it("baseline_only does not show fake zero progress", () => {
    const view = buildCoachingProgressView({
      enrollment: enrollmentBase,
      bodyRecords: [
        body("b1", "2026-07-01", { weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15 }),
      ],
      logDate: "2026-07-08",
    });
    expect(view.waitingForRetest).toBe(true);
    expect(view.outcomeStatus).toBe("not_yet_measurable");
    expect(view.customerSummary).not.toMatch(/沒有進步|0 kg/);
    expect(view.metrics.every((item) => item.delta == null)).toBe(true);
  });

  it("comparison view shows deltas", () => {
    const view = buildCoachingProgressView({
      enrollment: enrollmentBase,
      bodyRecords: [
        body("b2", "2026-07-20", { weightKg: 87.8, bodyFatPercent: 33.5, skeletalMuscleKg: 30.1, visceralFatLevel: 14 }),
        body("b1", "2026-07-01", { weightKg: 90, bodyFatPercent: 35, skeletalMuscleKg: 30, visceralFatLevel: 15 }),
      ],
      logDate: "2026-07-21",
    });
    expect(view.waitingForRetest).toBe(false);
    expect(view.outcomeStatus).toBe("improving");
    const weight = view.metrics.find((item) => item.key === "weightKg");
    expect(weight?.delta).toBe(-2.2);
  });
});

describe("A–H regression smoke", () => {
  it("A remains on_track with empty priorities", () => {
    const packed = buildScenarioDecisionContext("A_normal");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.priorities).toEqual([]);
    expect(packed.decisionContext.goalContext.goalType).toBe("fat_loss");
  });

  it("E remains off_track", () => {
    const packed = buildScenarioDecisionContext("E_full_day_off_track");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("off_track");
  });

  it("F remains on_track single fried", () => {
    const packed = buildScenarioDecisionContext("F_single_meal_fried");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
  });

  it("H remains on_track empty priorities", () => {
    const packed = buildScenarioDecisionContext("H_on_track_day");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.priorities).toEqual([]);
  });

  it("G hunger still prioritized", () => {
    const packed = buildScenarioDecisionContext("G_shake_hunger");
    expect(packed.decisionContext.customerVoice.some((item) => item.key === "hunger_reported")).toBe(true);
    expect(packed.decisionContext.priorities[0]?.signalKey).toMatch(/hunger/);
  });
});

describe("fixtures I–N decision context", () => {
  it("maps I/J/K/L/M/N stages and outcomes", () => {
    const I = buildScenarioDecisionContext("I_baseline_only_fat_loss");
    expect(I.decisionContext.goalContext.measurementStage).toBe("baseline_only");
    expect(I.decisionContext.outcomeAssessment.outcomeStatus).toBe("not_yet_measurable");
    expect(I.decisionContext.goalContext.goalType).toBe("fat_loss");

    const J = buildScenarioDecisionContext("J_second_measurement_improving");
    expect(J.decisionContext.goalContext.measurementStage).toBe("comparison_available");
    expect(J.decisionContext.outcomeAssessment.outcomeStatus).toBe("improving");

    const K = buildScenarioDecisionContext("K_weight_down_muscle_loss");
    expect(K.decisionContext.outcomeAssessment.outcomeStatus).toBe("mixed");

    const L = buildScenarioDecisionContext("L_recomposition");
    expect(L.decisionContext.outcomeAssessment.outcomeStatus).toBe("improving");

    const M = buildScenarioDecisionContext("M_baseline_only_day10");
    expect(M.decisionContext.outcomeAssessment.outcomeStatus).toBe("not_yet_measurable");
    expect(M.decisionContext.goalContext.measurementStage).toBe("baseline_only");

    const N = buildScenarioDecisionContext("N_two_periods_flat");
    expect(N.decisionContext.goalContext.measurementStage).toBe("trend_available");
    expect(["flat", "mixed"]).toContain(N.decisionContext.outcomeAssessment.outcomeStatus);
  });
});
