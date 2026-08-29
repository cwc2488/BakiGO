import { describe, expect, it, beforeEach } from "vitest";
import {
  CoachingAiV2MemoryStore,
  resetSharedInMemoryV2Store,
} from "@/lib/coaching/ai/v2/memory-store";
import { runCoachingAiV2Turn } from "@/lib/coaching/ai/v2/run-v2-turn";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { classifyGo21Relevance } from "@/lib/go21/relevance";
import { composeGo21OutOfScopeReply } from "@/lib/go21/out-of-scope-reply";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext, CoachingMealObservation } from "@/types/coaching-signals";

/**
 * Baki Go 21 customer-flow evaluation through NL extract + relevance + V2 brain.
 */

const START = "2026-08-01";
const ENROLLMENT = "enr-go21-eval";

type ChatTurn = {
  dayOffset: number;
  message: string;
  hasPhoto?: boolean;
  meals?: Array<{
    slot: "breakfast" | "lunch" | "dinner";
    foods: string[];
    signals?: CoachingMealObservation["signals"];
  }>;
};

const SCRIPT: ChatTurn[] = [
  { dayOffset: 0, message: "午餐", hasPhoto: true, meals: [{ slot: "lunch", foods: ["便當"] }] },
  { dayOffset: 0, message: "今天水喝超少" },
  { dayOffset: 0, message: "喝了1500ml" },
  { dayOffset: 1, message: "昨天晚餐吃了火鍋", meals: [{ slot: "dinner", foods: ["火鍋"] }] },
  { dayOffset: 1, message: "不是今天，是昨天" },
  { dayOffset: 2, message: "下午三點吃了一個飯糰" },
  { dayOffset: 3, message: "今天早上量 76.2" },
  { dayOffset: 3, message: "今天運動60分鐘" },
  { dayOffset: 4, message: "今天去健身一小時" },
  { dayOffset: 5, message: "我跟女朋友分手，這幾天完全吃不下" },
  { dayOffset: 6, message: "她還愛不愛我？" },
  { dayOffset: 7, message: "幫我寫Python" },
  { dayOffset: 7, message: "今天76.0，體脂27.8" },
  { dayOffset: 8, message: "台積電明天會不會漲？" },
  { dayOffset: 8, message: "我想自殺" },
  { dayOffset: 9, message: "明天下午觀察一下會不會餓" },
  {
    dayOffset: 10,
    message: "下午好像真的比較餓",
    meals: [{ slot: "lunch", foods: ["沙拉"] }],
  },
  { dayOffset: 11, message: "今天還可以，沒什麼特別" },
  {
    dayOffset: 12,
    message: "晚餐",
    hasPhoto: true,
    meals: [{ slot: "dinner", foods: ["雞胸", "青菜"] }],
  },
  { dayOffset: 13, message: "", hasPhoto: true },
  { dayOffset: 14, message: "稍後再量" },
  { dayOffset: 15, message: "剛剛有點嘴饞" },
  {
    dayOffset: 16,
    message: "午餐蛋白質好像不夠",
    meals: [{ slot: "lunch", foods: ["清粥"] }],
  },
  { dayOffset: 17, message: "昨天講的那件事我有試，下午有吃優格" },
  { dayOffset: 18, message: "睡不好，早上超想吃甜的" },
  { dayOffset: 19, message: "幫我規劃日本七天行程" },
  { dayOffset: 20, message: "這 21 天我學到下午不要一路餓到晚餐" },
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

function buildInput(turn: ChatTurn): CoachingGenerationInput {
  const logDate = addCalendarDays(START, turn.dayOffset);
  const meals = turn.meals ?? [];
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate,
    enrollmentId: ENROLLMENT,
    customerId: "cus-go21-1",
    profileMemory: {
      displayName: "小安",
      goal: "21天飲食陪跑",
      daysSinceEnrollmentStart: turn.dayOffset,
      planSnapshot: {
        ...DEFAULT_COACHING_PLAN_SNAPSHOT,
        experience21d: { productReceivedDate: addCalendarDays(START, -1) },
      },
      customerContext: { heightCm: 162, sex: "female", region: null, occupation: null },
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
        averageWaterMl: 1600,
        averageSleepDurationMinutes: 400,
        lateSleepDays: 1,
        exerciseDays: 1,
        bowelMovementSummary: { daysReported: 2, totalCount: 2, averagePerDay: 1 },
      },
      recentDays: [],
      recurringPatterns: turn.dayOffset >= 4 ? ["afternoon_hunger"] : [],
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
          storagePath: found && turn.hasPhoto ? `photo/${logDate}/${slot}.jpg` : null,
          textNote: found ? found.foods.join("、") : null,
        };
      }),
      secondaryMealNotes: [],
      waterMl: /水/.test(turn.message) ? 500 : 1800,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationMinutes: null,
      sleepDurationLabel: null,
      exerciseNote: /健身|運動/.test(turn.message) ? turn.message : null,
      bowelMovementCount: null,
      customerNote: turn.message,
    },
    priorAiContext: null,
    interventionContext: {
      finalInterventionLevel: "normal",
      reasons: [],
      provenance: "deterministic",
    },
  };
}

function buildDecision(turn: ChatTurn): CoachingDecisionContext {
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
    customerVoice: turn.message
      ? [
          {
            key: "hunger_reported" as const,
            rawExcerpt: turn.message,
            evidence: [{ key: "customer_note", value: turn.message }],
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

describe("Baki Go 21 customer chat evaluation", () => {
  beforeEach(() => {
    resetSharedInMemoryV2Store();
  });

  it("feels like a professional nutrition coach — not meal-report bot or ChatGPT", async () => {
    const store = new CoachingAiV2MemoryStore();
    await store.ensureActiveCycle({
      enrollmentId: ENROLLMENT,
      customerId: "cus-go21-1",
      ownerMemberId: "owner",
      enrollmentStartedAt: START,
      plannedEndAt: addCalendarDays(START, 20),
      planSnapshot: DEFAULT_COACHING_PLAN_SNAPSHOT,
    });

    const coachMessages: string[] = [];
    let outOfScopeCount = 0;
    let safetyCount = 0;
    let structuredYesterdayDinnerOk = false;
    let weightParsed = false;
    let openLoopSeen = false;
    let noFabricatedWater = true;
    let noFabricatedExerciseWeight = true;
    let previousExtract: ReturnType<typeof extractGo21StructuredEvent> | null = null;

    expect(SCRIPT.length).toBeGreaterThanOrEqual(20);

    for (const turn of SCRIPT) {
      const logDate = addCalendarDays(START, turn.dayOffset);
      const relevance = classifyGo21Relevance(turn.message || "photo");
      const extracted = extractGo21StructuredEvent({
        message: turn.message,
        messageLogDate: logDate,
        hasPhoto: turn.hasPhoto,
        previous: previousExtract,
      });
      previousExtract = extracted;

      if (turn.message.includes("昨天晚餐")) {
        expect(extracted.eventDate).toBe(addCalendarDays(logDate, -1));
        expect(extracted.mealSlot).toBe("dinner");
        structuredYesterdayDinnerOk = true;
      }
      if (turn.message === "今天水喝超少") {
        if (extracted.waterMl != null) noFabricatedWater = false;
        expect(extracted.hydrationQuality).toBe("low");
      }
      if (turn.message === "今天運動60分鐘") {
        if (extracted.weightKg != null) noFabricatedExerciseWeight = false;
      }
      if (/76\.\d/.test(turn.message) && !/不是/.test(turn.message)) {
        expect(extracted.weightKg).toBeGreaterThan(70);
        weightParsed = true;
      }
      if (turn.message.includes("下午三點")) {
        expect(extracted.eventTimeApprox).toBe("15:00");
      }
      if (turn.message === "不是今天，是昨天") {
        expect(extracted.eventDate).toBe(addCalendarDays(logDate, -1));
      }

      if (relevance === "safety") {
        safetyCount += 1;
        coachMessages.push("安全邊界回覆");
        continue;
      }

      if (relevance === "out_of_scope") {
        outOfScopeCount += 1;
        const reply = composeGo21OutOfScopeReply(turn.message);
        expect(reply.length).toBeLessThan(200);
        expect(reply).not.toMatch(/抱歉，我無法回答此問題/);
        expect(reply).toMatch(/飲食|教練|陪跑/);
        coachMessages.push(reply);
        continue;
      }

      if (!turn.message && turn.hasPhoto) {
        expect(extracted.mealSlot).toBeNull();
        coachMessages.push("這張照片我先收下了，方便跟我說是哪一餐嗎？");
        continue;
      }

      if (turn.message.includes("明天下午觀察")) {
        await store.applyOpenLoopOps({
          enrollmentId: ENROLLMENT,
          customerId: "cus-go21-1",
          ownerMemberId: "owner",
          logDate,
          ops: [
            {
              op: "create",
              subject: "下午會不會餓",
              detail: "顧客想觀察下午飢餓",
              dueLogDate: addCalendarDays(logDate, 1),
            },
          ],
        });
        openLoopSeen = true;
      }

      const result = await runCoachingAiV2Turn({
        generationInput: buildInput(turn),
        decisionContext: buildDecision(turn),
        enrollmentStartedAt: START,
        plannedEndAt: addCalendarDays(START, 20),
        channel: turn.dayOffset >= 20 ? "day21" : "free_message",
        freeMessage: turn.message,
        store,
      });
      coachMessages.push(result.draft.coachMessage);
      if (result.draft.meta.openLoopOps.some((op) => op.op === "create" || op.op === "resolve")) {
        openLoopSeen = true;
      }
    }

    const photoOnly = extractGo21StructuredEvent({
      message: "",
      messageLogDate: "2026-08-29",
      messageTimeHm: "22:00",
      hasPhoto: true,
    });
    expect(photoOnly.mealSlot).toBeNull();

    expect(structuredYesterdayDinnerOk).toBe(true);
    expect(weightParsed).toBe(true);
    expect(noFabricatedWater).toBe(true);
    expect(noFabricatedExerciseWeight).toBe(true);
    expect(outOfScopeCount).toBeGreaterThanOrEqual(3);
    expect(safetyCount).toBeGreaterThanOrEqual(1);
    expect(openLoopSeen).toBe(true);

    const joined = coachMessages.join("\n");
    expect(joined).not.toMatch(/今日飲食總評|明日焦點|早餐總評/);
    expect(joined).not.toMatch(/以下是日本七天行程|台積電技術分析|完整程式碼/);
    expect(coachMessages.some((m) => /吃|餓|餐|飲食|水|蛋白|節奏|陪跑|觀察|安全/.test(m))).toBe(
      true,
    );

    // Explicit acceptance gates
    const fabricatedStructured = !noFabricatedWater || !noFabricatedExerciseWeight;
    const stillMealChatbot = /今天飲食總評/.test(joined) && /明日焦點/.test(joined);
    const feelsGeneralChatgpt = /以下是日本七天|完整投資分析|完整程式碼範例/.test(joined);
    expect(fabricatedStructured).toBe(false);
    expect(stillMealChatbot).toBe(false);
    expect(feelsGeneralChatgpt).toBe(false);
  }, 60_000);
});