import { describe, expect, it } from "vitest";
import {
  assessGo21VisionFoodRelevance,
  pickGo21VisionVisibleHint,
} from "@/lib/go21/vision-food-relevance";
import { gateGo21VisionObservations } from "@/lib/go21/realtime-vision";
import {
  buildGo21CurrentTurnEvidence,
  go21CurrentTurnBlocksNutritionMutation,
} from "@/lib/go21/current-turn-evidence";
import { buildMinimalDecisionContextForFreeMessage } from "@/lib/coaching/ai/v2/minimal-decision-context";
import { buildGo21TemporalTimeline } from "@/lib/go21/temporal-meal-state";
import { generateCoachingAiV2 } from "@/lib/coaching/ai/v2/generate-v2";
import { buildCoachingAiV2UserPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { COACHING_AI_V2_PROMPT_VERSION } from "@/types/coaching-ai-v2";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import type { CoachingMealObservation } from "@/types/coaching-signals";
import { compactGo21CoachPlanForAi, buildGo21CoachPlanSnapshot, resolveGo21CoachPlanForDate } from "@/lib/go21/coach-plan";
import { inferGo21PlanExecutionFromMessage } from "@/lib/go21/plan-execution";
import { coachMessageLooksLikeHealthAppStructure } from "@/lib/go21/human-coach-voice";

/**
 * P0 regression: Production cat photo + 「是不是不能開玩笑？」failure class.
 * History contains 會議午餐/飯糰/沙拉 — must NOT dominate current image.
 */

function emptyMemory(day = 8): CoachingAiV2MemoryBundle {
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

function giWithStaleLunch(): CoachingGenerationInput {
  return {
    enrollmentId: "enr-p0",
    customerId: "cus-p0",
    logDate: "2026-08-29",
    profileMemory: {
      displayName: "小美",
      goal: "減脂",
      daysSinceEnrollmentStart: 8,
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
        { mealSlot: "lunch", textNote: "會議午餐吃飯糰", storagePath: null },
        { mealSlot: "dinner", textNote: null, storagePath: null },
      ],
      secondaryMealNotes: [{ mealSlot: "snacks", textNote: "考慮晚餐沙拉", storagePath: null }],
      waterMl: 1200,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationLabel: null,
      exerciseNote: null,
      bowelMovementCount: null,
      customerNote: "中午炒麵也考慮過",
    },
    rollingMemory: { recurringPatterns: [], recentWins: [], openConcerns: [] },
    recentCoachActionMemory: [],
  } as unknown as CoachingGenerationInput;
}

const CAT_OBS: CoachingMealObservation = {
  mealSlot: "lunch",
  observedFoods: ["貓"],
  signals: [],
  evidenceText: ["一隻橘貓躺在吊床上"],
  isFoodRelevant: false,
  subjectKind: "non_food",
  confidence: "high",
};

const PLAN = buildGo21CoachPlanSnapshot({
  source: "activation",
  items: [
    { period: "breakfast", name: "奶昔", amount: "1 杯" },
    { period: "lunch", name: "正常餐", amount: null },
    { period: "dinner", name: "奶昔", amount: "1 杯" },
  ],
});

describe("P0 current-turn evidence + generation pipeline", () => {
  it("TURN 1 — cat photo: non-food gate + stale lunch must not become image contents", () => {
    const relevance = assessGo21VisionFoodRelevance(CAT_OBS);
    expect(relevance.isFoodRelevant).toBe(false);
    expect(pickGo21VisionVisibleHint(CAT_OBS)).toMatch(/貓/);

    const gated = gateGo21VisionObservations({
      observations: [CAT_OBS],
      mealSlotUnresolved: true,
      mealSlotResolved: null,
    });
    expect(gated.foodRelevant).toBe(false);
    expect(gated.observations).toEqual([]);
    expect(gated.evidenceSummary).toMatch(/非餐點|貓/);
    expect(gated.evidenceSummary).not.toMatch(/飯糰|沙拉|炒麵/);

    const evidence = buildGo21CurrentTurnEvidence({
      hasPhoto: true,
      customerMessage: "",
      foodRelevant: false,
      imageDescription: "貓",
      visionSummary: gated.evidenceSummary,
      confidence: "high",
    });
    expect(evidence.kind).toBe("image_non_food");
    expect(go21CurrentTurnBlocksNutritionMutation(evidence)).toBe(true);

    // Critical: do not merge today's 飯糰 into mealObservations for this turn
    const decision = buildMinimalDecisionContextForFreeMessage({
      generationInput: giWithStaleLunch(),
      freeMessage: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：貓",
      mealObservations: [],
      currentTurnNonFoodPhoto: true,
    });
    expect(decision.mealObservations).toEqual([]);

    // Without the flag, stale lunch WOULD contaminate (documents the bug class)
    const contaminated = buildMinimalDecisionContextForFreeMessage({
      generationInput: giWithStaleLunch(),
      freeMessage: "（傳了一張照片）",
      mealObservations: [],
      currentTurnNonFoodPhoto: false,
    });
    expect(contaminated.mealObservations.some((o) => o.observedFoods.join("").includes("飯糰"))).toBe(
      true,
    );

    // Temporal: non-food vision summary must not become todayEaten
    const timeline = buildGo21TemporalTimeline({
      generationLogDate: "2026-08-29",
      todayMealNotes: giWithStaleLunch().todayContext.primaryMeals.map((m) => ({
        slot: m.mealSlot,
        note: m.textNote,
      })),
      visionSummaries: [{ summary: "非餐點｜可見：貓｜不建立飲食紀錄", correction: null }],
      currentMessage: "（傳了一張照片）",
    });
    expect(timeline.todayEaten.some((e) => /貓/.test(e.label))).toBe(false);

    // Plan completion must not fire for non-food vision
    const items = resolveGo21CoachPlanForDate({ version: 1, current: PLAN, history: [] }, "2026-08-29");
    const day = inferGo21PlanExecutionFromMessage({
      message: "（傳了一張照片）",
      planItems: items,
      prior: null,
      logDate: "2026-08-29",
      visionIsFood: false,
      visionFoodLabel: "貓",
    });
    expect(day?.items.every((i) => i.status === "unknown") ?? true).toBe(true);

    // Prompt must carry currentTurnEvidence and empty mealFoodsToday
    const user = buildCoachingAiV2UserPrompt({
      generationInput: giWithStaleLunch(),
      decisionContext: decision,
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：貓",
      visionNonFood: true,
      currentTurnEvidence: evidence,
      coachDailyPlan: compactGo21CoachPlanForAi({ planItems: items, dayRecord: null }),
      dailyTargetsState: {
        logDate: "2026-08-29",
        targets: { waterMl: 2500, caloriesKcal: 1600, proteinG: 100, sleepHours: 7 },
        approxToday: {
          waterMl: 800,
          waterConfidence: "reported",
          caloriesKcal: 600,
          caloriesRange: [500, 700],
          caloriesConfidence: "low",
          proteinG: 30,
          proteinRange: [20, 40],
          proteinConfidence: "low",
          sleepHours: null,
          sleepConfidence: "none",
          sleepNote: null,
        },
        softCues: ["蛋白質偏少"],
        guidance: "quiet",
      },
    });
    expect(user).toMatch(/currentTurnEvidence/);
    expect(user).toMatch(/image_non_food/);
    expect(user).toMatch(/mealFoodsToday":\[\]/);
    expect(user).toMatch(/softCues":\[\]/);
    expect(COACHING_AI_V2_PROMPT_VERSION).toMatch(/current_turn_evidence/);
  });

  it("TURN 1 live path — deterministic non-food reply without OpenAI contamination", async () => {
    const evidence = buildGo21CurrentTurnEvidence({
      hasPhoto: true,
      customerMessage: "",
      foodRelevant: false,
      imageDescription: "貓",
      visionSummary: "非餐點｜可見：貓｜不建立飲食紀錄",
      confidence: "high",
    });
    const decision = buildMinimalDecisionContextForFreeMessage({
      generationInput: giWithStaleLunch(),
      freeMessage: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：貓",
      mealObservations: [],
      currentTurnNonFoodPhoto: true,
    });

    const prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-should-not-be-called";
    try {
      const result = await generateCoachingAiV2({
        generationInput: giWithStaleLunch(),
        decisionContext: decision,
        finalInterventionLevel: "normal",
        memory: emptyMemory(),
        channel: "free_message",
        freeMessage: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：貓",
        visionNonFood: true,
        currentTurnEvidence: evidence,
      });
      expect(result.draft.coachMessage).toMatch(/不能吃|不是餐點|😂/);
      expect(result.draft.coachMessage).not.toMatch(/飯糰|會議午餐|沙拉|蛋白質|均衡/);
      expect(result.model).toMatch(/deterministic/);
      expect(coachMessageLooksLikeHealthAppStructure(result.draft.coachMessage)).toBe(false);
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
    }
  });

  it("TURN 2 — 「是不是不能開玩笑？」produces usable coach_message without OpenAI", async () => {
    const prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-should-not-be-called";
    try {
      const result = await generateCoachingAiV2({
        generationInput: giWithStaleLunch(),
        decisionContext: {
          finalInterventionLevel: "normal",
          dailyNutritionAssessment: { level: "on_track", reasons: [] },
          priorities: [],
          mealObservations: [],
          customerVoice: [],
          recurringIssue: null,
          improvedIssue: null,
          outcomeAssessment: { outcomeStatus: "unclear", customerSummary: "", coachSummary: "" },
        } as unknown as CoachingDecisionContext,
        finalInterventionLevel: "normal",
        memory: emptyMemory(),
        channel: "free_message",
        freeMessage: "是不是不能開玩笑？",
        visionNonFood: false,
        dailyTargetsState: {
          logDate: "2026-08-29",
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
          softCues: ["蛋白質偏少", "水偏少"],
          guidance: "quiet",
        },
        coachDailyPlan: compactGo21CoachPlanForAi({
          planItems: resolveGo21CoachPlanForDate({ version: 1, current: PLAN, history: [] }, "2026-08-29"),
          dayRecord: null,
        }),
      });
      expect(result.draft.coachMessage.trim().length).toBeGreaterThan(0);
      expect(result.draft.coachMessage).toMatch(/玩笑|認真|😂|哈哈/);
      expect(result.draft.coachMessage).not.toMatch(/蛋白質|熱量|奶昔|減脂|均衡|沙拉/);
      expect(result.model).toBe("deterministic_conversational");
    } finally {
      if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevKey;
    }
  });

  it("TURN 3 — real food photo remains authoritative when foodRelevant", () => {
    const foodObs: CoachingMealObservation = {
      mealSlot: "lunch",
      observedFoods: ["便當", "青菜", "雞腿"],
      signals: [],
      evidenceText: ["可見便當"],
      isFoodRelevant: true,
      subjectKind: "food",
      confidence: "medium",
    };
    const relevance = assessGo21VisionFoodRelevance(foodObs);
    expect(relevance.isFoodRelevant).toBe(true);
    const gated = gateGo21VisionObservations({
      observations: [foodObs],
      mealSlotUnresolved: false,
      mealSlotResolved: "lunch",
    });
    expect(gated.foodRelevant).toBe(true);
    expect(gated.observations[0]?.observedFoods).toContain("便當");

    const evidence = buildGo21CurrentTurnEvidence({
      hasPhoto: true,
      customerMessage: "午餐",
      foodRelevant: true,
      imageDescription: "便當",
      visionSummary: gated.evidenceSummary,
    });
    expect(go21CurrentTurnBlocksNutritionMutation(evidence)).toBe(false);

    // Prior cat must not block food path
    const decision = buildMinimalDecisionContextForFreeMessage({
      generationInput: giWithStaleLunch(),
      freeMessage: "午餐",
      mealObservations: gated.observations,
      currentTurnNonFoodPhoto: false,
    });
    expect(decision.mealObservations.some((o) => o.observedFoods.includes("便當"))).toBe(true);
  });

  it("merged stale food+cat residue: non-food label still wins the gate", () => {
    const contaminated: CoachingMealObservation = {
      mealSlot: "lunch",
      observedFoods: ["飯糰", "沙拉", "貓"],
      signals: ["starch_concentrated"],
      evidenceText: ["可見一隻貓"],
      isFoodRelevant: false,
      subjectKind: "non_food",
      confidence: "medium",
    };
    const relevance = assessGo21VisionFoodRelevance(contaminated);
    expect(relevance.isFoodRelevant).toBe(false);
    expect(pickGo21VisionVisibleHint(contaminated)).toMatch(/貓/);
  });

  it("generation success invariant: usable coach_message required (deterministic path)", async () => {
    const result = await generateCoachingAiV2({
      generationInput: giWithStaleLunch(),
      decisionContext: buildMinimalDecisionContextForFreeMessage({
        generationInput: giWithStaleLunch(),
        freeMessage: "好啦",
        mealObservations: [],
      }),
      finalInterventionLevel: "normal",
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "好啦",
    });
    expect(result.draft.coachMessage.trim().length).toBeGreaterThan(0);
  });
});
