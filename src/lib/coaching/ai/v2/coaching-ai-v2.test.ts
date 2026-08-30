import { describe, expect, it, beforeEach } from "vitest";
import {
  coachingAiV2DayNumber,
  coachingAiV2LifecycleStage,
  buildLifecycleSnapshot,
  resolveAiV2CycleWindow,
} from "@/lib/coaching/ai/v2/lifecycle";
import {
  CoachingAiV2MemoryStore,
  resetSharedInMemoryV2Store,
} from "@/lib/coaching/ai/v2/memory-store";
import { assessCoachingAiV2Safety } from "@/lib/coaching/ai/v2/v2-safety";
import { parseCoachingAiV2Generation } from "@/lib/coaching/ai/v2/v2-output-schema";
import { runCoachingAiV2Turn } from "@/lib/coaching/ai/v2/run-v2-turn";
import { extractCoachMessageFromOutput } from "@/lib/coaching/ai/v2/v2-bridge";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";

function baseGenerationInput(overrides?: Partial<CoachingGenerationInput>): CoachingGenerationInput {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate: "2026-08-10",
    enrollmentId: "enr-v2-1",
    customerId: "cus-v2-1",
    profileMemory: {
      displayName: "小明",
      goal: "減脂",
      daysSinceEnrollmentStart: 0,
      planSnapshot: { ...DEFAULT_COACHING_PLAN_SNAPSHOT },
      customerContext: {
        heightCm: 170,
        sex: "male",
        region: null,
        occupation: "工程師",
      },
      baselineMeasurement: null,
    },
    rollingMemory: {
      windowDays: 14,
      aggregates: {
        windowDays: 14,
        daysWithReport: 1,
        daysSubmitted: 1,
        mealReportRate: 1,
        breakfastCompletionRate: 1,
        lunchCompletionRate: 1,
        dinnerCompletionRate: 1,
        averageWaterMl: 2000,
        averageSleepDurationMinutes: 420,
        lateSleepDays: 0,
        exerciseDays: 0,
        bowelMovementSummary: { daysReported: 0, totalCount: 0, averagePerDay: null },
      },
      recentDays: [],
      recurringPatterns: [],
    },
    outcomeMemory: {
      baselineMeasurement: null,
      latestMeasurement: null,
      daysBetweenMeasurements: null,
      trendDeltas: [],
      trendSummary: null,
      measurementCount: 0,
      measurementSequence: [],
    },
    coachDirectives: null,
    recentCoachActionMemory: null,
    todayContext: {
      logDate: "2026-08-10",
      submitted: true,
      primaryMeals: [
        { mealSlot: "breakfast", storagePath: null, textNote: "奶昔" },
        { mealSlot: "lunch", storagePath: null, textNote: "雞胸便當" },
        { mealSlot: "dinner", storagePath: null, textNote: "炒飯" },
      ],
      secondaryMealNotes: [],
      waterMl: 2000,
      sleepBedtime: "23:30",
      sleepWakeTime: "07:00",
      sleepDurationMinutes: 450,
      sleepDurationLabel: "7.5 小時",
      exerciseNote: null,
      bowelMovementCount: 1,
      customerNote: null,
    },
    priorAiContext: null,
    interventionContext: {
      finalInterventionLevel: "normal",
      reasons: [],
      provenance: "deterministic",
    },
    ...overrides,
  };
}

function mealObs(
  slot: "breakfast" | "lunch" | "dinner",
  foods: string[],
  signals: Array<
    | "sugary_drink"
    | "low_protein"
    | "fried_food"
    | "high_sauce"
    | "processed_food"
    | "vegetable_low"
    | "meal_skipped"
    | "shake_dominant"
    | "starch_concentrated"
  > = [],
  extra: Partial<CoachingDecisionContext["mealObservations"][number]> = {},
): CoachingDecisionContext["mealObservations"][number] {
  return {
    mealSlot: slot,
    observedFoods: foods,
    signals,
    evidenceText: foods,
    shakeObserved: foods.some((f) => /奶昔|shake/i.test(f)),
    solidFoodObserved: foods.some((f) => !/奶昔|shake/i.test(f)),
    confidence: "medium",
    ...extra,
  };
}

function baseDecision(
  overrides?: Partial<CoachingDecisionContext>,
): CoachingDecisionContext {
  const mealObservations = overrides?.mealObservations ?? [
    mealObs("breakfast", ["奶昔"], ["shake_dominant"]),
    mealObs("lunch", ["雞胸", "蔬菜"]),
    mealObs("dinner", ["炒飯"], ["starch_concentrated", "fried_food"]),
  ];
  const dailyNutritionAssessment =
    overrides?.dailyNutritionAssessment ?? assessDailyNutrition({ mealObservations });
  return {
    signals: [],
    positiveSignals: [],
    priorities: [],
    recurringIssue: null,
    improvedIssue: null,
    coachAttention: { required: false, reason: null, evidence: [] },
    finalInterventionLevel: "normal",
    customerVoice: [],
    mealObservations,
    photoReuse: [],
    pendingFollowUps: [],
    dailyNutritionAssessment,
    mealFollowUpBudget: {
      maxCustomerMealClarifications: 1,
      selectedMealSlot: null,
      selectedQuestion: null,
      suppressedMealSlots: [],
      consolidatedQuestion: null,
      allowCustomerMealClarification: false,
    },
    mealPlanContext: {
      breakfastAllowsShake: true,
      lunchAllowsShake: true,
      dinnerAllowsShake: true,
    },
    goalContext: {
      goalType: "fat_loss",
      goalLabel: "減脂",
      measurementStage: "baseline_only",
      baselineDate: null,
      latestMeasurementDate: null,
      measurementCount: 0,
      daysSinceBaseline: null,
      daysSinceLatestMeasurement: null,
      daysSinceEnrollmentStart: 0,
      goalRelevantMetrics: ["bodyFatPercent", "weightKg"],
    },
    outcomeAssessment: {
      goalContext: {
        goalType: "fat_loss",
        goalLabel: "減脂",
        measurementStage: "baseline_only",
        baselineDate: null,
        latestMeasurementDate: null,
        measurementCount: 0,
        daysSinceBaseline: null,
        daysSinceLatestMeasurement: null,
        daysSinceEnrollmentStart: 0,
        goalRelevantMetrics: ["bodyFatPercent", "weightKg"],
      },
      comparison: null,
      outcomeStatus: "not_yet_measurable",
      trendStatus: "insufficient_data",
      periods: [],
      reasons: [],
      evidence: [],
      customerSummary: "",
    },
    ...overrides,
  };
}

describe("AI Coach V2 lifecycle", () => {
  it("maps day numbers to stages", () => {
    expect(coachingAiV2LifecycleStage(1)).toBe("understand");
    expect(coachingAiV2LifecycleStage(4)).toBe("find_patterns");
    expect(coachingAiV2LifecycleStage(10)).toBe("experiment");
    expect(coachingAiV2LifecycleStage(18)).toBe("build_autonomy");
    expect(coachingAiV2LifecycleStage(21)).toBe("day21_ending");
    expect(coachingAiV2LifecycleStage(null)).toBe("post_cycle");
  });

  it("resolves 21-day window from experience snapshot", () => {
    const window = resolveAiV2CycleWindow({
      enrollmentStartedAt: "2026-08-01",
      planSnapshot: {
        ...DEFAULT_COACHING_PLAN_SNAPSHOT,
        experience21d: { productReceivedDate: "2026-07-31" },
      },
    });
    expect(window?.startDate).toBe("2026-08-01");
    expect(window?.plannedEndDate).toBe("2026-08-21");
    expect(
      coachingAiV2DayNumber({
        cycleStartDate: window!.startDate,
        cycleEndDate: window!.plannedEndDate,
        logDate: "2026-08-21",
      }),
    ).toBe(21);
  });
});

describe("AI Coach V2 safety", () => {
  it("triggers on medical / high-risk language", () => {
    const result = assessCoachingAiV2Safety({
      customerNote: "我想用瀉藥加速減脂，醫生說我可能有糖尿病",
    });
    expect(result.triggered).toBe(true);
    expect(result.escalate).toBe(true);
    expect(result.safeReply).toBeTruthy();
  });

  it("escalates explicit human coach request without medical template", () => {
    const result = assessCoachingAiV2Safety({ freeMessage: "我想找真人教練談談" });
    expect(result.escalate).toBe(true);
    expect(result.triggered).toBe(false);
  });
});

describe("AI Coach V2 schema", () => {
  it("parses freeform generation", () => {
    const parsed = parseCoachingAiV2Generation({
      coach_message: "今天先這樣，我沒什麼要念你的。",
      meta: {
        intention: "acknowledge",
        lifecycle_day: 2,
        lifecycle_stage: "understand",
        memory_writes: [],
        open_loop_ops: [],
        hypothesis_ops: [],
        safety_triggered: false,
        escalation_suggested: false,
        escalation_reason: null,
        day21_reflection: null,
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.coachMessage).toContain("沒什麼要念你");
    }
  });
});

describe("AI Coach V2 memory + scenarios", () => {
  let store: CoachingAiV2MemoryStore;

  beforeEach(() => {
    resetSharedInMemoryV2Store();
    store = new CoachingAiV2MemoryStore();
  });

  it("Scenario C — no-advice turn can be brief", async () => {
    const result = await runCoachingAiV2Turn({
      store,
      generationInput: baseGenerationInput({
        logDate: "2026-08-02",
        todayContext: {
          ...baseGenerationInput().todayContext,
          logDate: "2026-08-02",
          primaryMeals: [
            { mealSlot: "breakfast", storagePath: null, textNote: "奶昔+蛋" },
            { mealSlot: "lunch", storagePath: null, textNote: "雞胸沙拉" },
            { mealSlot: "dinner", storagePath: null, textNote: "清炒時蔬+魚" },
          ],
          customerNote: null,
        },
      }),
      decisionContext: baseDecision({
        mealObservations: [
          mealObs("breakfast", ["奶昔", "蛋"]),
          mealObs("lunch", ["雞胸", "沙拉"]),
          mealObs("dinner", ["蔬菜", "魚"]),
        ],
        dailyNutritionAssessment: {
          level: "on_track",
          evidence: [],
          reasons: [],
          positiveFactors: ["穩"],
          adjustmentSubjects: [],
          confidence: 0.8,
        },
      }),
      enrollmentStartedAt: "2026-08-01",
      channel: "daily_log",
    });
    const message = extractCoachMessageFromOutput(result.outputJson);
    expect(message).toBeTruthy();
    expect(message!.length).toBeLessThan(120);
    expect(result.draft.meta.intention).toMatch(/acknowledge|observe|casual|encourage/);
  });

  it("Scenario E — casual conversation without meal redirect", async () => {
    const result = await runCoachingAiV2Turn({
      store,
      generationInput: baseGenerationInput({
        logDate: "2026-08-05",
        todayContext: {
          ...baseGenerationInput().todayContext,
          logDate: "2026-08-05",
          primaryMeals: [
            { mealSlot: "breakfast", storagePath: null, textNote: null },
            { mealSlot: "lunch", storagePath: null, textNote: null },
            { mealSlot: "dinner", storagePath: null, textNote: null },
          ],
          customerNote: null,
        },
      }),
      decisionContext: baseDecision({
        mealObservations: [],
        dailyNutritionAssessment: {
          level: "insufficient_data",
          evidence: [],
          reasons: [],
          positiveFactors: [],
          adjustmentSubjects: [],
          confidence: 0.2,
        },
      }),
      enrollmentStartedAt: "2026-08-01",
      channel: "free_message",
      freeMessage: "今天加班好累，幾乎沒時間吃飯",
    });
    expect(result.draft.coachMessage).toMatch(/工作|累|休息|節奏/);
    expect(result.draft.coachMessage).not.toMatch(/早餐總評|明日焦點|今天飲食總評/);
  });

  it("Scenario B — open loop callback continues the thread", async () => {
    await store.ensureActiveCycle({
      enrollmentId: "enr-v2-1",
      customerId: "cus-v2-1",
      ownerMemberId: "own-1",
      enrollmentStartedAt: "2026-08-01",
    });
    await store.applyOpenLoopOps({
      enrollmentId: "enr-v2-1",
      customerId: "cus-v2-1",
      ownerMemberId: "own-1",
      logDate: "2026-08-08",
      ops: [
        {
          op: "create",
          subject: "明天晚餐觀察",
          detail: "確認晚上是否比較容易偏離",
          dueLogDate: "2026-08-09",
          status: "waiting",
        },
      ],
    });

    const result = await runCoachingAiV2Turn({
      store,
      generationInput: baseGenerationInput({
        logDate: "2026-08-09",
        profileMemory: {
          ...baseGenerationInput().profileMemory,
          daysSinceEnrollmentStart: 8,
        },
        todayContext: {
          ...baseGenerationInput().todayContext,
          logDate: "2026-08-09",
          primaryMeals: [
            { mealSlot: "breakfast", storagePath: null, textNote: "奶昔" },
            { mealSlot: "lunch", storagePath: null, textNote: "便當" },
            { mealSlot: "dinner", storagePath: "path/dinner.jpg", textNote: "炸物宵夜" },
          ],
        },
      }),
      decisionContext: baseDecision({
        mealObservations: [
          mealObs("breakfast", ["奶昔"], ["shake_dominant"]),
          mealObs("lunch", ["便當"]),
          mealObs("dinner", ["炸雞"], ["fried_food"]),
        ],
      }),
      enrollmentStartedAt: "2026-08-01",
    });

    expect(result.draft.coachMessage).toMatch(/之前想看|這就是/);
    const loops = [...store.openLoops.values()].filter((l) => l.enrollmentId === "enr-v2-1");
    expect(loops.some((l) => l.status === "resolved")).toBe(true);
  });

  it("Scenario D — hypothesis revises on contradictory evidence", async () => {
    await store.ensureActiveCycle({
      enrollmentId: "enr-v2-1",
      customerId: "cus-v2-1",
      ownerMemberId: "own-1",
      enrollmentStartedAt: "2026-08-01",
    });
    await store.applyHypothesisOps({
      enrollmentId: "enr-v2-1",
      customerId: "cus-v2-1",
      ownerMemberId: "own-1",
      ops: [
        {
          op: "create",
          statement: "傍晚失控可能跟白天吃太少有關",
          supportingEvidence: ["early pattern"],
          confidence: 0.6,
        },
      ],
    });

    const result = await runCoachingAiV2Turn({
      store,
      generationInput: baseGenerationInput({
        logDate: "2026-08-12",
        profileMemory: {
          ...baseGenerationInput().profileMemory,
          daysSinceEnrollmentStart: 11,
        },
      }),
      decisionContext: baseDecision({
        mealObservations: [
          mealObs("breakfast", ["蛋", "吐司", "牛奶"]),
          mealObs("lunch", ["雞胸", "飯", "青菜"]),
          mealObs("dinner", ["魚", "蔬菜"]),
        ],
        customerVoice: [],
      }),
      enrollmentStartedAt: "2026-08-01",
    });

    expect(result.draft.coachMessage).toMatch(/假設|放下|不像/);
    const hyps = [...store.hypotheses.values()].filter((h) => h.enrollmentId === "enr-v2-1");
    expect(hyps.some((h) => h.status === "weakened" || h.status === "rejected")).toBe(true);
  });

  it("Scenario G — safety boundary", async () => {
    const result = await runCoachingAiV2Turn({
      store,
      generationInput: baseGenerationInput({
        todayContext: {
          ...baseGenerationInput().todayContext,
          customerNote: "我想極端斷食到暈倒為止",
        },
      }),
      decisionContext: baseDecision(),
      enrollmentStartedAt: "2026-08-01",
    });
    expect(result.draft.meta.safetyTriggered).toBe(true);
    expect(result.draft.coachMessage).toMatch(/醫療|安全|專業/);
  });

  it("preserves lifecycle snapshot on cycle", async () => {
    const cycle = await store.ensureActiveCycle({
      enrollmentId: "enr-v2-1",
      customerId: "cus-v2-1",
      ownerMemberId: "own-1",
      enrollmentStartedAt: "2026-08-01",
    });
    const snap = buildLifecycleSnapshot({ cycle, logDate: "2026-08-05" });
    expect(snap.dayNumber).toBe(5);
    expect(snap.stage).toBe("find_patterns");
    expect(snap.intensiveActive).toBe(true);
  });
});
