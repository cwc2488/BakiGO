import { describe, expect, it } from "vitest";
import {
  fingerprintCoachingGenerationInput,
} from "@/lib/ai/input-fingerprint";
import { buildCoachingGenerationInput, buildGenerationTodayContext } from "@/lib/coaching/ai/build-coaching-generation-input";
import { assertGenerationInputFreeOfExcludedPii } from "@/lib/coaching/ai/coaching-generation-pii";
import {
  preservesCompletedOutputWhenDenied,
  planDailyCoachGenerationSubmit,
  resolveGenerationOutputMutation,
} from "@/lib/coaching/ai/coaching-generation-submit";
import { selectPriorCompletedAiOutput } from "@/lib/coaching/ai/select-prior-ai-output";
import { mapCoachDirectivesRecord } from "@/lib/coaching/ai/build-input-snapshot";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import {
  COACHING_AI_MAX_REGENERATIONS_PER_DAY,
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  COACHING_GENERATION_INPUT_VERSION,
} from "@/types/coaching-ai";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";
import type { BodyCompositionRecord, Customer } from "@/types/customer";

function enrollment(overrides?: Partial<CoachingEnrollment>): CoachingEnrollment {
  return {
    id: "enroll-1",
    customerId: "cust-1",
    ownerMemberId: "member-1",
    goal: "健康減脂",
    status: "active",
    startedAt: "2026-07-28T00:00:00.000Z",
    endedAt: null,
    onboardingCompletedAt: "2026-07-28T01:00:00.000Z",
    planSnapshot: cloneDefaultCoachingPlanSnapshot(),
    baselineBodyRecordId: "body-baseline",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-08-11T23:59:00.000Z",
    ...overrides,
  };
}

function customer(): Pick<Customer, "displayName" | "heightCm" | "sex" | "region" | "occupation"> {
  return {
    displayName: "Amy",
    heightCm: 165,
    sex: "female",
    region: "台北",
    occupation: "設計師",
  };
}

function dailyLog(logDate: string, overrides?: Partial<CoachingDailyLogDetail>): CoachingDailyLogDetail {
  return {
    id: `log-${logDate}`,
    enrollmentId: "enroll-1",
    customerId: "cust-1",
    ownerMemberId: "member-1",
    logDate,
    waterMl: 1800,
    exerciseNote: "快走",
    bowelMovementCount: 1,
    sleepDuration: "7小時30分",
    sleepBedtime: "23:30",
    sleepWakeTime: "07:00",
    customerNote: "今天狀態不錯",
    submittedAt: `${logDate}T10:00:00.000Z`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    meals: [
      {
        id: "breakfast-1",
        dailyLogId: `log-${logDate}`,
        mealSlot: "breakfast",
        textNote: "奶昔",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: {
          id: "photo-1",
          mealEntryId: "breakfast-1",
          storagePath: "cust/enroll/date/breakfast/x.jpg",
          uploadedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      {
        id: "lunch-1",
        dailyLogId: `log-${logDate}`,
        mealSlot: "lunch",
        textNote: "雞胸",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: {
          id: "photo-2",
          mealEntryId: "lunch-1",
          storagePath: "cust/enroll/date/lunch/y.jpg",
          uploadedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      {
        id: "snack-1",
        dailyLogId: `log-${logDate}`,
        mealSlot: "snacks",
        textNote: "堅果",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: {
          id: "photo-snack",
          mealEntryId: "snack-1",
          storagePath: "cust/enroll/date/snacks/secret.jpg",
          uploadedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ],
    ...overrides,
  };
}

const bodyBaseline: BodyCompositionRecord = {
  id: "body-baseline",
  customerId: "cust-1",
  recordDate: "2026-07-28",
  age: 32,
  weightKg: 62,
  skeletalMuscleKg: 24,
  bodyFatKg: 18,
  bmi: 22.8,
  bodyFatPercent: 29,
  visceralFatLevel: 8,
  basalMetabolicRate: 1300,
  bodyAge: 34,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const bodyLatest: BodyCompositionRecord = {
  ...bodyBaseline,
  id: "body-latest",
  recordDate: "2026-08-11",
  weightKg: 60.5,
  skeletalMuscleKg: 24.5,
  bodyFatPercent: 27.5,
  visceralFatLevel: 7,
  bmi: 22.2,
};

const priorCompletedOutput = {
  id: "out-prior",
  logDate: "2026-08-10",
  status: "completed" as const,
  outputJson: {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      encouragement: "a",
      today_feedback: "b",
      adjustment_priorities: [],
      tomorrow_focus: "明天維持早餐",
    },
    coach: {
      daily_summary: "s",
      recurring_issue: "晚睡",
      improved_issue: null,
      proposed_intervention_level: "watch" as const,
      coach_attention_required: false,
      attention_reason: null,
      evidence: [],
    },
  },
};

function buildInput(overrides?: {
  todayLog?: CoachingDailyLogDetail;
  recentLogs?: CoachingDailyLogDetail[];
  priorCompletedOutputs?: typeof priorCompletedOutput[];
  builtAt?: string;
}) {
  const today = overrides?.todayLog ?? dailyLog("2026-08-11");
  const recent = overrides?.recentLogs ?? [
    today,
    dailyLog("2026-08-10", { waterMl: 1200, submittedAt: null }),
    dailyLog("2026-08-09", { waterMl: null, meals: [], submittedAt: null }),
  ];

  return buildCoachingGenerationInput({
    enrollment: enrollment(),
    customer: customer(),
    logDate: "2026-08-11",
    todayLog: today,
    recentLogs: recent,
    bodyRecords: [bodyLatest, bodyBaseline],
    coachDirectives: {
      currentFocus: "早餐",
      currentPriority: "水量",
      coachInstruction: "這週先改善早餐",
      effectiveFrom: "2026-08-11",
    },
    priorCompletedOutputs: overrides?.priorCompletedOutputs,
    builtAt: overrides?.builtAt ?? "2026-08-11T12:00:00.000Z",
  });
}

describe("buildCoachingGenerationInput", () => {
  it("builds all memory layers without conversation history", () => {
    const input = buildInput();

    expect(input.version).toBe(COACHING_GENERATION_INPUT_VERSION);
    expect(input.profileMemory.displayName).toBe("Amy");
    expect(input.rollingMemory.aggregates.windowDays).toBe(14);
    expect(input.rollingMemory.recentDays.length).toBeLessThanOrEqual(3);
    expect(input.outcomeMemory.baselineMeasurement?.weightKg).toBe(62);
    expect(input.outcomeMemory.latestMeasurement?.weightKg).toBe(60.5);
    expect(input.outcomeMemory.trendDeltas.some((item) => item.label === "體重")).toBe(true);
    expect(input.coachDirectives?.coachInstruction).toBe("這週先改善早餐");
    expect(input.interventionContext).toEqual({
      finalInterventionLevel: "normal",
      reasons: [],
      provenance: "deterministic",
    });
    expect(input.priorAiContext).toBeNull();
  });

  it("includes prior AI context with ai_inference provenance from previous completed output", () => {
    const input = buildInput({ priorCompletedOutputs: [priorCompletedOutput] });

    expect(input.priorAiContext?.logDate).toBe("2026-08-10");
    expect(input.priorAiContext?.tomorrowFocus).toEqual({
      value: "明天維持早餐",
      provenance: "ai_inference",
      sourceOutputId: "out-prior",
      sourceLogDate: "2026-08-10",
    });
    expect(input.priorAiContext?.recurringIssue?.provenance).toBe("ai_inference");
    expect(input.priorAiContext?.recurringIssue?.value).toBe("晚睡");
  });

  it("selects only the most recent prior completed output before today", () => {
    const selected = selectPriorCompletedAiOutput(
      [
        priorCompletedOutput,
        { ...priorCompletedOutput, id: "out-older", logDate: "2026-08-08" },
        { ...priorCompletedOutput, id: "out-today", logDate: "2026-08-11", status: "completed" },
        { ...priorCompletedOutput, id: "out-pending", logDate: "2026-08-09", status: "pending" },
      ],
      "2026-08-11",
    );

    expect(selected?.id).toBe("out-prior");
  });

  it("excludes phone token email and internal auth fields from generation input", () => {
    const input = buildInput();
    const serialized = JSON.stringify(input);

    expect(serialized).not.toContain("member-1");
    expect(serialized).not.toContain("0912");
    expect(serialized).not.toContain("@example.com");
    expect(serialized).not.toContain("portal-token");
    expect(serialized).not.toContain("signedUrl");
    expect(serialized).not.toContain("mealEntryId");
    expect(serialized).not.toContain("secret.jpg");

    assertGenerationInputFreeOfExcludedPii(input);
  });

  it("includes breakfast/lunch/dinner photo storage paths but excludes snack images", () => {
    const input = buildInput();

    expect(input.todayContext.primaryMeals).toEqual([
      { mealSlot: "breakfast", storagePath: "cust/enroll/date/breakfast/x.jpg", textNote: "奶昔" },
      { mealSlot: "lunch", storagePath: "cust/enroll/date/lunch/y.jpg", textNote: "雞胸" },
      { mealSlot: "dinner", storagePath: null, textNote: null },
    ]);
    expect(input.todayContext.secondaryMealNotes.find((item) => item.mealSlot === "snacks")).toEqual({
      mealSlot: "snacks",
      textNote: "堅果",
    });
    expect(JSON.stringify(input.todayContext.secondaryMealNotes)).not.toContain("storagePath");
    expect(JSON.stringify(input.todayContext.primaryMeals)).not.toContain("secret.jpg");
  });

  it("provides body baseline latest and deltas without inventing measurements", () => {
    const input = buildInput();
    const emptyBodyInput = buildCoachingGenerationInput({
      enrollment: enrollment({ baselineBodyRecordId: null }),
      customer: customer(),
      logDate: "2026-08-11",
      todayLog: dailyLog("2026-08-11"),
      recentLogs: [dailyLog("2026-08-11")],
      bodyRecords: [],
    });

    expect(input.outcomeMemory.baselineMeasurement?.recordDate).toBe("2026-07-28");
    expect(input.outcomeMemory.latestMeasurement?.recordDate).toBe("2026-08-11");
    expect(input.outcomeMemory.trendDeltas.length).toBeGreaterThan(0);

    expect(emptyBodyInput.outcomeMemory.baselineMeasurement).toBeNull();
    expect(emptyBodyInput.outcomeMemory.latestMeasurement).toBeNull();
    expect(emptyBodyInput.outcomeMemory.trendDeltas).toEqual([]);
  });
});

describe("generation input fingerprint", () => {
  it("returns the same fingerprint for semantically identical input", () => {
    const first = buildInput({ builtAt: "2026-08-11T12:00:00.000Z" });
    const second = buildInput({ builtAt: "2026-08-11T18:00:00.000Z" });

    expect(fingerprintCoachingGenerationInput(first)).toBe(fingerprintCoachingGenerationInput(second));
  });

  it("changes fingerprint when meaningful content changes", () => {
    const baseline = buildInput();
    const changedWater = buildInput({
      todayLog: dailyLog("2026-08-11", { waterMl: 900 }),
    });
    const changedDirective = buildCoachingGenerationInput({
      enrollment: enrollment(),
      customer: customer(),
      logDate: "2026-08-11",
      todayLog: dailyLog("2026-08-11"),
      recentLogs: [dailyLog("2026-08-11")],
      bodyRecords: [bodyLatest, bodyBaseline],
      coachDirectives: mapCoachDirectivesRecord({
        currentFocus: "睡眠",
        currentPriority: "早睡",
        coachInstruction: "調整睡眠",
        effectiveFrom: "2026-08-11",
      }),
    });
    const changedPrior = buildInput({ priorCompletedOutputs: [priorCompletedOutput] });

    const baselineFingerprint = fingerprintCoachingGenerationInput(baseline);

    expect(fingerprintCoachingGenerationInput(changedWater)).not.toBe(baselineFingerprint);
    expect(fingerprintCoachingGenerationInput(changedDirective)).not.toBe(baselineFingerprint);
    expect(fingerprintCoachingGenerationInput(changedPrior)).not.toBe(baselineFingerprint);
  });

  it("ignores enrollment updatedAt when semantic content is unchanged", () => {
    const first = buildCoachingGenerationInput({
      enrollment: enrollment({ updatedAt: "2026-08-11T01:00:00.000Z" }),
      customer: customer(),
      logDate: "2026-08-11",
      todayLog: dailyLog("2026-08-11", { meals: dailyLog("2026-08-11").meals.slice(0, 2) }),
      recentLogs: [dailyLog("2026-08-11", { meals: dailyLog("2026-08-11").meals.slice(0, 2) })],
      bodyRecords: [bodyLatest, bodyBaseline],
    });
    const second = buildCoachingGenerationInput({
      enrollment: enrollment({ updatedAt: "2026-08-11T23:59:00.000Z" }),
      customer: customer(),
      logDate: "2026-08-11",
      todayLog: dailyLog("2026-08-11", { meals: dailyLog("2026-08-11").meals.slice(0, 2) }),
      recentLogs: [dailyLog("2026-08-11", { meals: dailyLog("2026-08-11").meals.slice(0, 2) })],
      bodyRecords: [bodyLatest, bodyBaseline],
    });

    expect(fingerprintCoachingGenerationInput(first)).toBe(fingerprintCoachingGenerationInput(second));
  });
});

describe("regeneration cap preserves completed output", () => {
  it("does not produce output mutation when regeneration is denied", () => {
    const existingOutput = {
      inputFingerprint: "fp-old",
      status: "completed" as const,
      regenerationCount: COACHING_AI_MAX_REGENERATIONS_PER_DAY,
    };

    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "fp-new",
      existingOutput,
      activeJobs: [],
    });

    const mutation = resolveGenerationOutputMutation(decision, "fp-new");

    expect(decision).toEqual({ action: "skip", reason: "max_regenerations_reached" });
    expect(mutation).toBeNull();
    expect(preservesCompletedOutputWhenDenied(existingOutput, decision, mutation)).toBe(true);
  });
});

describe("buildGenerationTodayContext", () => {
  it("never attaches image refs to secondary meals", () => {
    const today = buildGenerationTodayContext(dailyLog("2026-08-11"));
    expect(today.secondaryMealNotes.every((item) => !("storagePaths" in item))).toBe(true);
  });
});
