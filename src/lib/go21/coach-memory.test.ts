import { describe, expect, it } from "vitest";
import {
  collectReportedFoods,
  detectGo21CoachIntent,
  formatFoodRecallReply,
  formatGoalRecallReply,
  formatMenuSuggestionReply,
  shouldShowJumpToLatest,
} from "@/lib/go21/coach-intent";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { buildCoachingAiV2SystemPrompt, buildCoachingAiV2UserPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { go21SystemPromptProtectsCustomerGoal } from "@/lib/go21/conversation-quality";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";

describe("Go21 coach intent + memory recall", () => {
  it("detects memory / menu / meal / conflict intents", () => {
    expect(detectGo21CoachIntent({ freeMessage: "你還記得我跟你說我吃了什麼嗎？" })).toBe(
      "memory_food_recall",
    );
    expect(
      detectGo21CoachIntent({
        freeMessage: "Can you tell me what I told you? What did I tell you I ate?",
      }),
    ).toBe("memory_food_recall");
    expect(detectGo21CoachIntent({ freeMessage: "我的目標是什麼？" })).toBe("memory_goal_recall");
    expect(detectGo21CoachIntent({ freeMessage: "幫我推薦晚餐菜單" })).toBe("menu_request");
    expect(detectGo21CoachIntent({ freeMessage: "等一下想吃漢堡" })).toBe("goal_conflict_plan");
    expect(detectGo21CoachIntent({ freeMessage: "午餐吃了炸麵" })).toBe("meal_report");
  });

  it("collects only foods the customer actually reported", () => {
    const foods = collectReportedFoods({
      recentCustomerTurnContents: [
        "午餐吃了炸麵",
        "你還記得我跟你說我吃了什麼嗎？",
        "📷 照片",
      ],
      todayMealNotes: [{ slot: "breakfast", note: "雞胸沙拉" }],
      visionSummaries: [{ summary: "看起來像滷肉飯", correction: null }],
    });
    const labels = foods.map((f) => f.label);
    expect(labels).toEqual(expect.arrayContaining(["炸麵", "雞胸沙拉", "滷肉飯"]));
    expect(labels.join("")).not.toMatch(/記得|什麼嗎/);
  });

  it("formats food recall without inventing", () => {
    expect(formatFoodRecallReply([])).toMatch(/還沒有記到/);
    expect(formatFoodRecallReply([{ label: "炸麵", source: "turn" }])).toBe("你跟我說過：炸麵。");
  });

  it("multi-turn: meal report then memory question recalls actual food, not fat-loss lecture", () => {
    const memory = emptyMemory(9);
    memory.recentTurns = [
      customerTurn("午餐吃了炸麵"),
      coachTurn("收到，炸麵。以你現在的方向這餐偏重了一點；下一餐先選蛋白質清楚、油炸少一點的會比較穩。"),
    ];

    const recall = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory,
      channel: "free_message",
      freeMessage: "你還記得我跟你說我吃了什麼嗎？",
      go21Goal: fatLossGoal(),
    });
    expect(recall.coachMessage).toMatch(/炸麵/);
    expect(recall.coachMessage).not.toMatch(/雞胸沙拉|清淡|多吃菜|減脂時|蔬菜/);
    expect(recall.coachMessage).not.toMatch(/嗯，你還記得/);
  });

  it("English memory question also recalls foods", () => {
    const memory = emptyMemory(5);
    memory.recentTurns = [customerTurn("晚餐吃了滷肉飯")];
    const draft = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory,
      channel: "free_message",
      freeMessage: "Can you tell me what I told you I ate?",
      go21Goal: fatLossGoal(),
    });
    expect(draft.coachMessage).toMatch(/滷肉飯/);
    expect(draft.coachMessage).not.toMatch(/chicken|salad|lighter/i);
  });

  it("menu request returns actionable options, not a memory dodge", () => {
    const memory = emptyMemory(8);
    memory.recentTurns = [customerTurn("午餐吃了炸麵")];
    const draft = generateFixtureV2Draft({
      generationInput: {
        ...minimalGi(),
        todayContext: {
          ...minimalGi().todayContext,
          primaryMeals: [
            {
              mealSlot: "lunch",
              storagePath: null,
              textNote: "炸麵",
            },
          ],
        },
      },
      decisionContext: {
        ...minimalDecision(),
        mealObservations: [
          {
            mealSlot: "lunch",
            observedFoods: ["炸麵"],
            signals: ["fried_food"],
            evidenceText: ["炸麵"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "medium",
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory,
      channel: "free_message",
      freeMessage: "那晚餐給我一個菜單",
      go21Goal: fatLossGoal(),
    });
    expect(draft.coachMessage).toMatch(/雞胸|魚|青菜|蛋白質|清湯/);
    expect(draft.coachMessage).not.toMatch(/你跟我說過/);
  });

  it("goal conflict after heavy meal still steers", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGi(),
      decisionContext: {
        ...minimalDecision(),
        mealObservations: [
          {
            mealSlot: "lunch",
            observedFoods: ["炸麵"],
            signals: ["fried_food"],
            evidenceText: ["炸麵"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "medium",
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory: {
        ...emptyMemory(9),
        recentTurns: [customerTurn("午餐吃了炸麵")],
      },
      channel: "free_message",
      freeMessage: "等一下想吃漢堡",
      go21Goal: fatLossGoal(),
    });
    expect(draft.coachMessage).toMatch(/偏重|換|雞|方向/);
    expect(draft.coachMessage).not.toMatch(/很讚|好好吃|方向可以/);
  });

  it("prompts require answering memory questions from history first", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(sys).toMatch(/記憶／回想|記得並用真實歷史|據實回答/);
    expect(sys).toMatch(/意圖優先|萬用回覆/);
    expect(go21SystemPromptProtectsCustomerGoal(sys)).toBe(true);
    const user = buildCoachingAiV2UserPrompt({
      generationInput: minimalGi(),
      decisionContext: minimalDecision(),
      memory: emptyMemory(9),
      channel: "free_message",
      freeMessage: "我吃了什麼",
      go21Goal: fatLossGoal(),
    });
    expect(user).toMatch(/記憶回想|據實回答食物|禁止捏造/);
  });

  it("jump control hidden while following latest", () => {
    expect(
      shouldShowJumpToLatest({
        stickToBottom: true,
        scrollTop: 900,
        scrollHeight: 1000,
        clientHeight: 80,
      }),
    ).toBe(false);
    expect(
      shouldShowJumpToLatest({
        stickToBottom: false,
        scrollTop: 100,
        scrollHeight: 1000,
        clientHeight: 80,
      }),
    ).toBe(true);
    expect(
      shouldShowJumpToLatest({
        stickToBottom: false,
        scrollTop: 0,
        scrollHeight: 80,
        clientHeight: 80,
      }),
    ).toBe(false);
  });

  it("goal recall uses the customer's actual goal wording", () => {
    expect(
      formatGoalRecallReply({
        personalGoal: "三週減體脂",
        primaryDirectionLabel: "減脂／體態改善",
      }),
    ).toMatch(/三週減體脂/);
    expect(
      formatMenuSuggestionReply({
        primaryDirection: "fat_loss_body",
        personalGoal: "減脂",
        alreadyHeavyToday: true,
      }),
    ).toMatch(/偏重|雞胸|魚/);
  });
});

function fatLossGoal() {
  return {
    primaryDirection: "fat_loss_body",
    primaryDirectionLabel: "減脂／體態改善",
    personalGoal: "三週減體脂",
    targetWeightKg: 68,
    originalPersonalGoal: null,
    wasRefined: false,
    guidance: "protect goal",
  };
}

function emptyMemory(dayNumber: number): CoachingAiV2MemoryBundle {
  return {
    recentTurns: [],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber,
      stage: dayNumber >= 15 ? "build_autonomy" : "find_patterns",
      intensiveActive: true,
      daysRemaining: Math.max(0, 21 - dayNumber),
    },
  };
}

function customerTurn(content: string) {
  return {
    id: `c-${content.slice(0, 6)}`,
    enrollmentId: "enr",
    customerId: "cus",
    ownerMemberId: "own",
    cycleId: null,
    logDate: "2026-08-29",
    turnIndex: 1,
    role: "customer" as const,
    channel: "free_message" as const,
    content,
    contentSummary: null,
    aiOutputId: null,
    intention: null,
    metadata: {},
    createdAt: "2026-08-29T04:00:00.000Z",
  };
}

function coachTurn(content: string) {
  return {
    ...customerTurn(content),
    id: `a-${content.slice(0, 6)}`,
    role: "coach" as const,
    intention: "acknowledge" as const,
  };
}

function minimalGi(): CoachingGenerationInput {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate: "2026-08-29",
    enrollmentId: "enr-memory",
    customerId: "cus-memory",
    profileMemory: {
      displayName: "測試",
      goal: "減脂",
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
