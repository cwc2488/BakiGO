import { describe, expect, it, beforeEach } from "vitest";
import {
  CoachingAiV2MemoryStore,
  resetSharedInMemoryV2Store,
} from "@/lib/coaching/ai/v2/memory-store";
import { runCoachingAiV2Turn } from "@/lib/coaching/ai/v2/run-v2-turn";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext, CoachingMealObservation } from "@/types/coaching-signals";

/**
 * Golden 20–30+ turn longitudinal simulation for AI Coach V2.
 * Uses fixture provider (no OpenAI required) to evaluate architecture behavior.
 */

type SimTurn = {
  dayOffset: number;
  kind: "daily" | "casual" | "day21";
  note?: string;
  freeMessage?: string;
  meals?: Array<{
    slot: "breakfast" | "lunch" | "dinner";
    foods: string[];
    signals?: CoachingMealObservation["signals"];
  }>;
  hunger?: boolean;
};

const START = "2026-08-01";

const SCRIPT: SimTurn[] = [
  { dayOffset: 0, kind: "daily", note: "想減脂，但下午容易餓", meals: [
    { slot: "breakfast", foods: ["奶昔"], signals: ["shake_dominant"] },
    { slot: "lunch", foods: ["便當"] },
    { slot: "dinner", foods: ["火鍋", "飲料"], signals: ["sugary_drink"] },
  ], hunger: true },
  { dayOffset: 1, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"], signals: ["shake_dominant"] },
    { slot: "lunch", foods: ["沙拉"] },
    { slot: "dinner", foods: ["炒飯"], signals: ["starch_concentrated", "fried_food"] },
  ], hunger: true },
  { dayOffset: 2, kind: "casual", freeMessage: "今天加班好累" },
  { dayOffset: 3, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"], signals: ["shake_dominant"] },
    { slot: "lunch", foods: ["雞胸"] },
    { slot: "dinner", foods: ["炸物"], signals: ["fried_food"] },
  ], hunger: true },
  { dayOffset: 4, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"], signals: ["shake_dominant"] },
    { slot: "lunch", foods: ["清粥"] },
    { slot: "dinner", foods: ["拉麵"], signals: ["starch_concentrated"] },
  ], hunger: true },
  { dayOffset: 5, kind: "daily", note: "還是會很餓", meals: [
    { slot: "breakfast", foods: ["奶昔"], signals: ["shake_dominant"] },
    { slot: "lunch", foods: ["便當"] },
    { slot: "dinner", foods: ["披薩"], signals: ["processed_food", "starch_concentrated"] },
  ], hunger: true },
  { dayOffset: 6, kind: "casual", freeMessage: "今天還可以嗎？" },
  { dayOffset: 7, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"], signals: ["shake_dominant"] },
    { slot: "lunch", foods: ["沙拉"] },
    { slot: "dinner", foods: ["火鍋"], signals: ["high_sauce"] },
  ], hunger: true },
  { dayOffset: 8, kind: "daily", note: "下午試了無糖優格", meals: [
    { slot: "breakfast", foods: ["奶昔", "蛋"] },
    { slot: "lunch", foods: ["雞胸", "蔬菜"] },
    { slot: "dinner", foods: ["魚", "青菜"] },
  ] },
  { dayOffset: 9, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"] },
    { slot: "lunch", foods: ["便當"] },
    { slot: "dinner", foods: ["炒飯"], signals: ["fried_food"] },
  ], hunger: true },
  { dayOffset: 10, kind: "casual", freeMessage: "睡不好，有點煩" },
  { dayOffset: 11, kind: "daily", meals: [
    { slot: "breakfast", foods: ["蛋", "吐司", "牛奶"] },
    { slot: "lunch", foods: ["雞胸", "飯", "青菜"] },
    { slot: "dinner", foods: ["魚", "蔬菜"] },
  ] },
  { dayOffset: 12, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"] },
    { slot: "lunch", foods: ["沙拉", "雞"] },
    { slot: "dinner", foods: ["鍋貼"], signals: ["fried_food"] },
  ] },
  { dayOffset: 13, kind: "daily", note: "下午點心有吃到", meals: [
    { slot: "breakfast", foods: ["奶昔", "香蕉"] },
    { slot: "lunch", foods: ["便當"] },
    { slot: "dinner", foods: ["雞胸", "蔬菜"] },
  ] },
  { dayOffset: 14, kind: "casual", freeMessage: "謝謝，今天先這樣" },
  { dayOffset: 15, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"] },
    { slot: "lunch", foods: ["沙拉"] },
    { slot: "dinner", foods: ["壽司"] },
  ] },
  { dayOffset: 16, kind: "daily", meals: [
    { slot: "breakfast", foods: ["蛋餅"], signals: ["fried_food"] },
    { slot: "lunch", foods: ["麵"], signals: ["starch_concentrated"] },
    { slot: "dinner", foods: ["火鍋"] },
  ] },
  { dayOffset: 17, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔", "蛋"] },
    { slot: "lunch", foods: ["雞胸沙拉"] },
    { slot: "dinner", foods: ["清蒸魚", "青菜"] },
  ] },
  { dayOffset: 18, kind: "casual", freeMessage: "週末跟朋友聚餐有點失控" },
  { dayOffset: 19, kind: "daily", meals: [
    { slot: "breakfast", foods: ["奶昔"] },
    { slot: "lunch", foods: ["便當"] },
    { slot: "dinner", foods: ["沙拉"] },
  ] },
  { dayOffset: 20, kind: "day21", note: "最後一天回報", meals: [
    { slot: "breakfast", foods: ["奶昔", "蛋"] },
    { slot: "lunch", foods: ["雞胸", "蔬菜"] },
    { slot: "dinner", foods: ["魚", "青菜"] },
  ] },
];

function mealObs(
  slot: "breakfast" | "lunch" | "dinner",
  foods: string[],
  signals: CoachingMealObservation["signals"] = [],
): CoachingMealObservation {
  return {
    mealSlot: slot,
    observedFoods: foods,
    signals,
    evidenceText: foods,
    shakeObserved: foods.some((f) => /奶昔/.test(f)),
    solidFoodObserved: foods.some((f) => !/奶昔/.test(f)),
    confidence: "medium",
  };
}

function buildInput(turn: SimTurn, enrollmentId: string): CoachingGenerationInput {
  const logDate = addCalendarDays(START, turn.dayOffset);
  const meals = turn.meals ?? [];
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate,
    enrollmentId,
    customerId: "cus-sim-1",
    profileMemory: {
      displayName: "小華",
      goal: "減脂",
      daysSinceEnrollmentStart: turn.dayOffset,
      planSnapshot: {
        ...DEFAULT_COACHING_PLAN_SNAPSHOT,
        experience21d: { productReceivedDate: addCalendarDays(START, -1) },
      },
      customerContext: { heightCm: 165, sex: "female", region: null, occupation: "業務" },
      baselineMeasurement: null,
    },
    rollingMemory: {
      windowDays: 14,
      aggregates: {
        windowDays: 14,
        daysWithReport: turn.dayOffset + 1,
        daysSubmitted: turn.dayOffset + 1,
        mealReportRate: 0.9,
        breakfastCompletionRate: 0.9,
        lunchCompletionRate: 0.9,
        dinnerCompletionRate: 0.9,
        averageWaterMl: 1800,
        averageSleepDurationMinutes: 400,
        lateSleepDays: 2,
        exerciseDays: 1,
        bowelMovementSummary: { daysReported: 3, totalCount: 3, averagePerDay: 1 },
      },
      recentDays: [],
      recurringPatterns: turn.dayOffset >= 4 ? ["afternoon_hunger", "evening_deviation"] : [],
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
      logDate,
      submitted: true,
      primaryMeals: (["breakfast", "lunch", "dinner"] as const).map((slot) => {
        const found = meals.find((m) => m.slot === slot);
        return {
          mealSlot: slot,
          storagePath: found ? `photo/${logDate}/${slot}.jpg` : null,
          textNote: found ? found.foods.join("、") : null,
        };
      }),
      secondaryMealNotes: [],
      waterMl: 1800,
      sleepBedtime: "00:10",
      sleepWakeTime: "07:00",
      sleepDurationMinutes: 410,
      sleepDurationLabel: "約 6.8 小時",
      exerciseNote: null,
      bowelMovementCount: 1,
      customerNote: turn.note ?? null,
    },
    priorAiContext: null,
    interventionContext: {
      finalInterventionLevel: "normal",
      reasons: [],
      provenance: "deterministic",
    },
  };
}

function buildDecision(turn: SimTurn): CoachingDecisionContext {
  const mealObservations = (turn.meals ?? []).map((m) =>
    mealObs(m.slot, m.foods, m.signals ?? []),
  );
  const dailyNutritionAssessment = assessDailyNutrition({ mealObservations });
  return {
    signals: [],
    positiveSignals: [],
    priorities: [],
    recurringIssue: null,
    improvedIssue: null,
    coachAttention: { required: false, reason: null, evidence: [] },
    finalInterventionLevel: "normal",
    customerVoice: turn.hunger
      ? [
          {
            key: "hunger_reported" as const,
            rawExcerpt: "還是會很餓",
            evidence: [{ key: "customer_note", value: "還是會很餓" }],
          },
        ]
      : [],
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
      daysSinceEnrollmentStart: turn.dayOffset,
      goalRelevantMetrics: ["bodyFatPercent"],
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
        daysSinceEnrollmentStart: turn.dayOffset,
        goalRelevantMetrics: ["bodyFatPercent"],
      },
      comparison: null,
      outcomeStatus: "not_yet_measurable",
      trendStatus: "insufficient_data",
      periods: [],
      reasons: [],
      evidence: [],
      customerSummary: "",
    },
  };
}

function looksLikeSectionedReport(message: string): boolean {
  const markers = ["今天飲食總評", "明日焦點", "今天最重要的調整", "早餐：", "午餐：", "晚餐："];
  return markers.filter((m) => message.includes(m)).length >= 2;
}

describe("AI Coach V2 golden longitudinal simulation", () => {
  let store: CoachingAiV2MemoryStore;

  beforeEach(() => {
    resetSharedInMemoryV2Store();
    store = new CoachingAiV2MemoryStore();
  });

  it("runs 20+ turns with memory, variance, open loops, and day-21 reflection", async () => {
    const enrollmentId = "enr-sim-golden";
    const messages: string[] = [];
    const intentions: string[] = [];
    let sawOpenLoopCallback = false;
    let sawNoAdvice = false;
    let sawCasual = false;
    let sawPattern = false;
    let day21Message = "";

    expect(SCRIPT.length).toBeGreaterThanOrEqual(20);

    for (const turn of SCRIPT) {
      const generationInput = {
        ...buildInput(turn, enrollmentId),
        enrollmentId,
      };
      const result = await runCoachingAiV2Turn({
        store,
        generationInput,
        decisionContext: buildDecision(turn),
        enrollmentStartedAt: START,
        planSnapshot: generationInput.profileMemory.planSnapshot,
        channel: turn.kind === "casual" ? "free_message" : turn.kind === "day21" ? "day21" : "daily_log",
        freeMessage: turn.freeMessage,
      });

      const message = result.draft.coachMessage;
      messages.push(message);
      intentions.push(result.draft.meta.intention);

      expect(looksLikeSectionedReport(message)).toBe(false);

      if (turn.kind === "casual") {
        sawCasual = true;
        expect(message).not.toMatch(/今天飲食總評|calorie|巨量營養/);
      }
      if (/沒什麼要念你|先這樣|收到|休息/.test(message) && message.length < 80) {
        sawNoAdvice = true;
      }
      if (/之前想看|這就是我/.test(message)) {
        sawOpenLoopCallback = true;
      }
      if (/這幾天|模式|假設|下午|傍晚|白天/.test(message) && turn.dayOffset >= 4) {
        sawPattern = true;
      }
      if (turn.kind === "day21") {
        day21Message = message;
      }
    }

    // Anti-template: openings should not all be identical
    const openings = messages.map((m) => m.slice(0, 12));
    const uniqueOpenings = new Set(openings);
    expect(uniqueOpenings.size).toBeGreaterThan(5);

    // Intentions should vary
    expect(new Set(intentions).size).toBeGreaterThan(3);

    // Memory should have accumulated
    const memory = [...store.memory.values()].filter((m) => m.enrollmentId === enrollmentId);
    expect(memory.length).toBeGreaterThan(0);

    // Turns recorded
    const turns = [...store.turns.values()].filter((t) => t.enrollmentId === enrollmentId);
    expect(turns.length).toBeGreaterThanOrEqual(40); // customer + coach pairs

    expect(sawCasual).toBe(true);
    expect(sawNoAdvice || intentions.includes("acknowledge") || intentions.includes("casual")).toBe(
      true,
    );
    expect(sawPattern || sawOpenLoopCallback).toBe(true);

    // Day 21 personalized reflection
    expect(day21Message.length).toBeGreaterThan(80);
    expect(day21Message).not.toMatch(/恭喜完成21天挑戰/);
    expect(day21Message).toMatch(/模式|改變|卡住|下一步|一開始/);

    const reflections = [...store.reflections.values()].filter(
      (r) => r.enrollmentId === enrollmentId,
    );
    expect(reflections.length).toBe(1);
    expect(reflections[0]!.reflectionJson.nextActions.length).toBeGreaterThan(0);
    expect(reflections[0]!.reflectionJson.majorPatterns.length).toBeGreaterThan(0);

    // Final product question
    const stillFeelsLikeMealChatbot = messages.every((m) =>
      /總評|調整：|想確認：|明日焦點/.test(m),
    );
    expect(stillFeelsLikeMealChatbot).toBe(false);
  }, 60_000);
});
