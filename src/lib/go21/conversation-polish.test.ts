import { describe, expect, it } from "vitest";
import {
  coachMessageEndsWithQuestion,
  coachMessageHasEmptyFoodPraise,
  go21SystemPromptAllowsTimelyConcreteTip,
  go21SystemPromptIncludesShortPolicy,
  go21SystemPromptPrefersConciseDefault,
  go21SystemPromptAllowsStopWithoutQuestion,
  go21SystemPromptPrefersMealPhotoJudgment,
  go21SystemPromptProtectsCustomerGoal,
} from "@/lib/go21/conversation-quality";
import { buildCoachingAiV2SystemPrompt, buildCoachingAiV2UserPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { isChatNearBottom } from "@/lib/go21/coach-context";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Go21 conversation polish", () => {
  it("prefers concise default without restoring SOP quotas", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(go21SystemPromptPrefersConciseDefault(sys)).toBe(true);
    expect(go21SystemPromptIncludesShortPolicy(sys)).toBe(true);
    expect(sys).not.toMatch(/30–80/);
    expect(sys).not.toMatch(/每則必建議/);
  });

  it("allows timely concrete tips without advice-every-turn", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(go21SystemPromptAllowsTimelyConcreteTip(sys)).toBe(true);
    expect(sys).toMatch(/沒有.*必建議|不是每則都要給建議/);
    const user = buildCoachingAiV2UserPrompt({
      generationInput: minimalGi(),
      decisionContext: minimalDecision(),
      memory: emptyMemory(9),
      channel: "free_message",
      freeMessage: "現在十一點超想吃",
    });
    expect(user).toContain("一句具體建議");
  });

  it("allows stopping without a trailing question; meal photos prefer judgment", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(go21SystemPromptAllowsStopWithoutQuestion(sys)).toBe(true);
    expect(go21SystemPromptPrefersMealPhotoJudgment(sys)).toBe(true);
    expect(go21SystemPromptProtectsCustomerGoal(sys)).toBe(true);
    const user = buildCoachingAiV2UserPrompt({
      generationInput: minimalGi(),
      decisionContext: minimalDecision(),
      memory: emptyMemory(9),
      channel: "free_message",
      freeMessage: "📷",
    });
    expect(user).toMatch(/收尾不要預設問句|不要叫顧客自己評價這餐|護住目標/);
  });

  it("simple food log stays concise; goal moment may include one concrete tip", () => {
    const food = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(3),
      channel: "free_message",
      freeMessage: "晚餐吃了滷肉飯",
    });
    expect(food.coachMessage.length).toBeLessThan(40);
    expect(food.coachMessage).not.toMatch(/蔬菜|蛋白質|建議你/);

    const craving = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(10),
      channel: "free_message",
      freeMessage: "現在十一點，我突然超想吃東西",
      go21Goal: {
        primaryDirection: "reduce_chaos_eating",
        primaryDirectionLabel: "減少失控飲食",
        personalGoal: "改善晚上一直吃宵夜",
        targetWeightKg: null,
        originalPersonalGoal: null,
        wasRefined: false,
        guidance: "use when relevant",
      },
    });
    expect(craving.coachMessage).toMatch(/茶|水|撐/);
    expect(coachMessageEndsWithQuestion(craving.coachMessage)).toBe(false);
    expect(craving.coachMessage.split("\n").length).toBeLessThanOrEqual(3);
  });

  it("meal photo with cues gives judgment instead of asking customer to self-evaluate", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: {
        ...minimalDecision(),
        dailyNutritionAssessment: {
          level: "needs_adjustment",
          reasons: ["heavy"],
          positiveFactors: [],
          adjustmentSubjects: ["dinner"],
          confidence: "medium",
        },
        mealObservations: [
          {
            mealSlot: "dinner",
            observedFoods: ["炸雞"],
            signals: ["fried_food"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "medium",
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory: emptyMemory(8),
      channel: "free_message",
      freeMessage: "[影像觀察] 看起來像炸雞便當",
      go21Goal: {
        primaryDirection: "fat_loss_body",
        primaryDirectionLabel: "減脂／體態改善",
        personalGoal: "三週減體脂",
        targetWeightKg: 70,
        originalPersonalGoal: null,
        wasRefined: false,
        guidance: "protect goal",
      },
    });
    expect(draft.coachMessage).toMatch(/偏重|收一點|記著/);
    expect(draft.coachMessage).not.toMatch(/你覺得|哪裡跟前幾天|我先不搶答/);
    expect(coachMessageEndsWithQuestion(draft.coachMessage)).toBe(false);
    expect(coachMessageHasEmptyFoodPraise(draft.coachMessage)).toBe(false);
  });

  it("fat loss + fried earlier + planned hamburger steers toward a better choice", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: {
        ...minimalDecision(),
        mealObservations: [
          {
            mealSlot: "lunch",
            observedFoods: ["炸麵"],
            signals: ["fried_food"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "medium",
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory: {
        ...emptyMemory(9),
        recentTurns: [
          {
            id: "t1",
            role: "customer" as const,
            channel: "free_message" as const,
            logDate: "2026-08-29",
            content: "午餐吃了炸麵",
            intention: null,
            createdAt: "2026-08-29T04:00:00.000Z",
          } as never,
        ],
      },
      channel: "free_message",
      freeMessage: "等一下想吃漢堡",
      go21Goal: {
        primaryDirection: "fat_loss_body",
        primaryDirectionLabel: "減脂／體態改善",
        personalGoal: "減脂改善體態",
        targetWeightKg: 68,
        originalPersonalGoal: null,
        wasRefined: false,
        guidance: "protect goal",
      },
    });
    expect(draft.coachMessage).toMatch(/偏重|換|雞|沙拉|蛋白質|方向/);
    expect(draft.coachMessage).not.toMatch(/很讚|好好吃|方向可以/);
    expect(coachMessageHasEmptyFoodPraise(draft.coachMessage)).toBe(false);
    expect(coachMessageEndsWithQuestion(draft.coachMessage)).toBe(false);
  });

  it("autonomy on-track does not quiz the customer about the meal", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: {
        ...minimalDecision(),
        dailyNutritionAssessment: {
          level: "on_track",
          reasons: [],
          positiveFactors: ["balanced"],
          adjustmentSubjects: [],
          confidence: "high",
        },
        mealObservations: [
          {
            mealSlot: "lunch",
            observedFoods: ["沙拉"],
            signals: [],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "high",
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory: emptyMemory(18),
      channel: "daily_log",
    });
    expect(draft.coachMessage).not.toMatch(/你覺得|我先不搶答/);
    expect(coachMessageEndsWithQuestion(draft.coachMessage)).toBe(false);
  });

  it("default near-bottom threshold is mobile-friendly", () => {
    expect(
      isChatNearBottom({ scrollTop: 880, scrollHeight: 1000, clientHeight: 80 }),
    ).toBe(true);
    expect(
      isChatNearBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 80 }),
    ).toBe(false);
  });

  it("chat UI pins to latest on send and ignores programmatic scroll unlock", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/go21/Go21App.tsx"), "utf8");
    expect(src).toContain("followLatestConversation");
    expect(src).toContain("programmaticScrollRef");
    expect(src).toContain("schedulePinToLatest");
    expect(src).toContain("shouldFollowOnAssistantArrival");
    expect(src).toContain("thresholdPx: 120");
  });
});

function emptyMemory(dayNumber: number) {
  return {
    recentTurns: [],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber,
      stage: dayNumber >= 15 ? ("build_autonomy" as const) : ("find_patterns" as const),
      intensiveActive: true,
      daysRemaining: Math.max(0, 21 - dayNumber),
    },
  };
}

function minimalGi(): CoachingGenerationInput {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate: "2026-08-29",
    enrollmentId: "enr-polish",
    customerId: "cus-polish",
    profileMemory: {
      displayName: "測試",
      goal: "改善宵夜",
      daysSinceEnrollmentStart: 9,
      planSnapshot: DEFAULT_COACHING_PLAN_SNAPSHOT,
      sex: null,
      birthYear: null,
      heightCm: null,
    },
    todayContext: {
      submitted: true,
      primaryMeals: [],
      secondaryMealNotes: [],
      waterMl: null,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationLabel: null,
      exerciseNote: null,
      bowelMovementCount: null,
      customerNote: null,
    },
    rollingMemory: { recurringPatterns: [] },
    photoContext: { meals: [] },
  } as unknown as CoachingGenerationInput;
}

function minimalDecision(): CoachingDecisionContext {
  return {
    finalInterventionLevel: "normal",
    dailyNutritionAssessment: {
      level: "insufficient_data",
      reasons: [],
      positiveFactors: [],
      adjustmentSubjects: [],
      confidence: "low",
    },
    priorities: [],
    mealObservations: [],
    customerVoice: [],
    recurringIssue: null,
    improvedIssue: null,
    outcomeAssessment: { outcomeStatus: "insufficient_data", customerSummary: "" },
    coachAttention: { required: false, reason: null },
  } as unknown as CoachingDecisionContext;
}
