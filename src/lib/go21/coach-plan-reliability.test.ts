import { describe, expect, it } from "vitest";
import {
  assessGo21VisionFoodRelevance,
  buildGo21NonFoodEvidenceSummary,
} from "@/lib/go21/vision-food-relevance";
import { gateGo21VisionObservations } from "@/lib/go21/realtime-vision";
import {
  buildGo21CoachPlanSnapshot,
  compactGo21CoachPlanForAi,
  parseGo21CoachPlanRecord,
  resolveGo21CoachPlanForDate,
} from "@/lib/go21/coach-plan";
import { inferGo21PlanExecutionFromMessage } from "@/lib/go21/plan-execution";
import { detectGo21ConversationalMove } from "@/lib/go21/conversational-move";
import { composeGo21NaturalConversationalReply } from "@/lib/go21/conversational-move";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { buildCoachingAiV2UserPrompt, buildCoachingAiV2SystemPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { coachMessageLooksLikeHealthAppStructure } from "@/lib/go21/human-coach-voice";
import { COACHING_AI_V2_PROMPT_VERSION } from "@/types/coaching-ai-v2";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import type { CoachingMealObservation } from "@/types/coaching-signals";

function emptyMemory(day = 5): CoachingAiV2MemoryBundle {
  return {
    recentTurns: [],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber: day,
      stage: "find_patterns",
      intensiveActive: true,
      daysRemaining: 21 - day,
    },
  };
}

function gi(): CoachingGenerationInput {
  return {
    enrollmentId: "enr-plan-1",
    customerId: "cus-plan-1",
    logDate: "2026-08-12",
    profileMemory: {
      displayName: "小美",
      goal: "減脂",
      daysSinceEnrollmentStart: 5,
      planSnapshot: null,
      sex: null,
      heightCm: null,
      latestWeightKg: null,
      latestBodyFatPercent: null,
    },
    todayContext: {
      submitted: true,
      primaryMeals: [
        { mealSlot: "breakfast", textNote: null, storagePath: null },
        { mealSlot: "lunch", textNote: null, storagePath: null },
        { mealSlot: "dinner", textNote: null, storagePath: null },
      ],
      secondaryMealNotes: [],
      waterMl: 1000,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationLabel: null,
      exerciseNote: null,
      bowelMovementCount: null,
      customerNote: null,
    },
    rollingMemory: { recurringPatterns: [], recentWins: [], openConcerns: [] },
    recentCoachActionMemory: [],
  } as unknown as CoachingGenerationInput;
}

function decision(): CoachingDecisionContext {
  return {
    finalInterventionLevel: "normal",
    dailyNutritionAssessment: { level: "on_track", reasons: [] },
    priorities: [],
    mealObservations: [],
    customerVoice: [],
    recurringIssue: null,
    improvedIssue: null,
    outcomeAssessment: { outcomeStatus: "unclear", customerSummary: "", coachSummary: "" },
  } as unknown as CoachingDecisionContext;
}

const SHAKE_PLAN = buildGo21CoachPlanSnapshot({
  source: "activation",
  effectiveFrom: "2026-08-12",
  items: [
    { period: "breakfast", name: "奶昔", amount: "1 杯" },
    { period: "lunch", name: "正常餐", amount: null },
    { period: "dinner", name: "奶昔", amount: "1 杯" },
  ],
});

describe("GO21 Coach Daily Plan + conversation reliability", () => {
  it("stores generic coach plan without brand hardcoding", () => {
    const record = parseGo21CoachPlanRecord({
      version: 1,
      current: SHAKE_PLAN,
      history: [],
    });
    expect(record?.current.items).toHaveLength(3);
    const forDay = resolveGo21CoachPlanForDate(record, "2026-08-12");
    expect(forDay.map((i) => `${i.period}:${i.name}`)).toEqual([
      "breakfast:奶昔",
      "lunch:正常餐",
      "dinner:奶昔",
    ]);
    const compact = compactGo21CoachPlanForAi({ planItems: forDay, dayRecord: null });
    expect(compact?.guidance).toMatch(/不可默默改寫/);
  });

  it("CRITICAL — cat photo is non-food: no meal observations / nutrition path", () => {
    const catObs: CoachingMealObservation = {
      mealSlot: "lunch",
      observedFoods: ["貓"],
      signals: [],
      evidenceText: ["可見一隻貓"],
      isFoodRelevant: false,
      subjectKind: "non_food",
      confidence: "high",
    };
    const relevance = assessGo21VisionFoodRelevance(catObs);
    expect(relevance.isFoodRelevant).toBe(false);
    const gated = gateGo21VisionObservations({
      observations: [catObs],
      mealSlotUnresolved: false,
      mealSlotResolved: "lunch",
    });
    expect(gated.foodRelevant).toBe(false);
    expect(gated.observations).toEqual([]);
    expect(gated.evidenceSummary).toMatch(/非餐點/);
    expect(buildGo21NonFoodEvidenceSummary(relevance)).toMatch(/貓/);

    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：貓｜不建立飲食紀錄",
      visionNonFood: true,
      coachDailyPlan: compactGo21CoachPlanForAi({
        planItems: resolveGo21CoachPlanForDate(
          { version: 1, current: SHAKE_PLAN, history: [] },
          "2026-08-12",
        ),
        dayRecord: null,
      }),
    });
    expect(draft.coachMessage).toMatch(/不能吃|不是餐點|😂/);
    expect(draft.coachMessage).not.toMatch(/午餐|熱量|蛋白質|便當/);
  });

  it("CRITICAL — humor after non-food: social, zero nutrition", () => {
    const move = detectGo21ConversationalMove({
      freeMessage: "是不是不能開玩笑？",
      recentTurns: [
        { role: "customer", content: "（傳了一張照片）" },
        { role: "coach", content: "這個不能吃啦 😂" },
      ],
    });
    expect(move?.move).toBe("meta_ai_tease");
    const reply = composeGo21NaturalConversationalReply(move!);
    expect(reply).toMatch(/玩笑|認真/);
    expect(coachMessageLooksLikeHealthAppStructure(reply)).toBe(false);

    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "是不是不能開玩笑？",
      visionNonFood: false,
      dailyTargetsState: {
        logDate: "2026-08-12",
        targets: { waterMl: 2500, caloriesKcal: 1600, proteinG: 100, sleepHours: 7 },
        approxToday: {
          waterMl: 800,
          waterConfidence: "reported",
          caloriesKcal: null,
          caloriesRange: null,
          caloriesConfidence: "none",
          proteinG: null,
          proteinRange: null,
          proteinConfidence: "none",
          sleepHours: null,
          sleepConfidence: "none",
          sleepNote: null,
        },
        softCues: ["蛋白質偏少"],
        guidance: "Do not nag",
      },
    });
    expect(draft.coachMessage).toMatch(/玩笑|認真|😂|哈哈/);
    expect(draft.coachMessage).not.toMatch(/蛋白質|熱量|均衡|沙拉/);
  });

  it("CRITICAL — intentional dinner deviation is not compliance policing", () => {
    const items = resolveGo21CoachPlanForDate(
      { version: 1, current: SHAKE_PLAN, history: [] },
      "2026-08-12",
    );
    const day = inferGo21PlanExecutionFromMessage({
      message: "晚上聚餐，奶昔今天先不喝",
      planItems: items,
      prior: null,
      logDate: "2026-08-12",
    });
    const dinner = day?.items.find((i) => i.itemId === items.find((x) => x.period === "dinner")?.id);
    expect(dinner?.status).toBe("skipped_intentional");
    expect(dinner?.confidence).toBe("high");

    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "晚上聚餐，奶昔今天先不喝",
      coachDailyPlan: compactGo21CoachPlanForAi({ planItems: items, dayRecord: day }),
    });
    expect(draft.coachMessage).toMatch(/聚餐|先不|記著/);
    expect(draft.coachMessage).not.toMatch(/完成率|未完成|達標失敗|請完成/);
  });

  it("CRITICAL — evening heavy food vs dinner shake plan gets one useful beat", () => {
    const items = resolveGo21CoachPlanForDate(
      { version: 1, current: SHAKE_PLAN, history: [] },
      "2026-08-12",
    );
    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "晚上想吃雞排",
      go21Goal: {
        primaryDirection: "fat_loss_body",
        primaryDirectionLabel: "減脂",
        personalGoal: "瘦一點",
        targetWeightKg: null,
        originalPersonalGoal: null,
        wasRefined: false,
        guidance: "protect",
      },
      coachDailyPlan: compactGo21CoachPlanForAi({ planItems: items, dayRecord: null }),
    });
    expect(draft.coachMessage).toMatch(/晚餐原本|奶昔/);
    expect(coachMessageLooksLikeHealthAppStructure(draft.coachMessage)).toBe(false);
  });

  it("breakfast completion inferred from natural language", () => {
    const items = resolveGo21CoachPlanForDate(
      { version: 1, current: SHAKE_PLAN, history: [] },
      "2026-08-12",
    );
    const day = inferGo21PlanExecutionFromMessage({
      message: "早上的奶昔喝完了",
      planItems: items,
      prior: null,
      logDate: "2026-08-12",
    });
    const breakfast = day?.items.find(
      (i) => i.itemId === items.find((x) => x.period === "breakfast")?.id,
    );
    expect(breakfast?.status).toBe("completed");
  });

  it("plan edit effectiveFrom keeps prior history meaningful", () => {
    const day1 = buildGo21CoachPlanSnapshot({
      source: "activation",
      effectiveFrom: "2026-08-01",
      items: [{ period: "dinner", name: "奶昔", amount: "1 杯" }],
    });
    const day10 = buildGo21CoachPlanSnapshot({
      source: "coach_edit",
      effectiveFrom: "2026-08-10",
      items: [{ period: "dinner", name: "正常餐", amount: null }],
    });
    const record = {
      version: 1 as const,
      current: day10,
      history: [{ at: "2026-08-10T00:00:00Z", plan: day1, reason: "coach_edit" }],
    };
    // Before effectiveFrom of new plan → historical dinner shake
    expect(resolveGo21CoachPlanForDate(record, "2026-08-05")[0]?.name).toBe("奶昔");
    // On/after → normal meal
    expect(resolveGo21CoachPlanForDate(record, "2026-08-12")[0]?.name).toBe("正常餐");
  });

  it("prompt injects coachDailyPlan quietly and blocks health-app salad pack", () => {
    expect(COACHING_AI_V2_PROMPT_VERSION).toMatch(/coach_plan/);
    const sys = buildCoachingAiV2SystemPrompt();
    expect(sys).toMatch(/coachDailyPlan|教練每日安排/);
    expect(sys).toMatch(/健康 App|沙拉/);

    const items = resolveGo21CoachPlanForDate(
      { version: 1, current: SHAKE_PLAN, history: [] },
      "2026-08-12",
    );
    const user = buildCoachingAiV2UserPrompt({
      generationInput: gi(),
      decisionContext: decision(),
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "晚餐吃什麼？",
      coachDailyPlan: compactGo21CoachPlanForAi({ planItems: items, dayRecord: null }),
      dailyTargetsState: {
        logDate: "2026-08-12",
        targets: { waterMl: 2500, caloriesKcal: 1600, proteinG: 100, sleepHours: 7 },
        approxToday: {
          waterMl: 800,
          waterConfidence: "reported",
          caloriesKcal: 400,
          caloriesRange: [300, 500],
          caloriesConfidence: "low",
          proteinG: 25,
          proteinRange: [15, 35],
          proteinConfidence: "low",
          sleepHours: null,
          sleepConfidence: "none",
          sleepNote: null,
        },
        softCues: ["蛋白質偏少"],
        guidance: "quiet",
      },
    });
    expect(user).toMatch(/coachDailyPlan/);
    expect(user).toMatch(/不可默默改寫|不要每則背誦/);

    expect(
      coachMessageLooksLikeHealthAppStructure(
        "如果晚餐想改成沙拉，記得選擇搭配一些蛋白質，這樣會幫助更均衡。",
      ),
    ).toBe(true);
  });

  it("heuristic gate: empty foods without cues → not food-relevant", () => {
    const unclear: CoachingMealObservation = {
      mealSlot: "lunch",
      observedFoods: [],
      signals: [],
      evidenceText: [],
      confidence: "low",
    };
    expect(assessGo21VisionFoodRelevance(unclear).isFoodRelevant).toBe(false);
  });
});
