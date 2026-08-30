import { describe, expect, it } from "vitest";
import {
  buildCoachingAiV2SystemPrompt,
  buildCoachingAiV2UserPrompt,
  coachingBrainLooksUnscripted,
} from "@/lib/coaching/ai/v2/v2-prompts";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import {
  coachMessageSoundsLikeHealthApp,
  composeGo21NaturalConversationalReply,
  detectGo21ConversationalMove,
} from "@/lib/go21/conversational-move";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle, CoachingAiV2Turn } from "@/types/coaching-ai-v2";
import { COACHING_AI_V2_PROMPT_VERSION } from "@/types/coaching-ai-v2";

function gi(): CoachingGenerationInput {
  return {
    enrollmentId: "enr-nat-1",
    customerId: "cus-nat-1",
    logDate: "2026-08-10",
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
        { mealSlot: "lunch", textNote: "炸麵", storagePath: null },
        { mealSlot: "dinner", textNote: null, storagePath: null },
      ],
      secondaryMealNotes: [],
      waterMl: null,
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

function decisionHeavyLunch(): CoachingDecisionContext {
  return {
    finalInterventionLevel: "watch",
    dailyNutritionAssessment: { level: "needs_attention", reasons: [] },
    priorities: [],
    mealObservations: [
      {
        mealSlot: "lunch",
        observedFoods: ["炸麵"],
        signals: ["fried_food"],
        shakeObserved: false,
        solidFoodObserved: true,
        confidence: 0.8,
      },
    ],
    customerVoice: [],
    recurringIssue: null,
    improvedIssue: null,
    outcomeAssessment: {
      outcomeStatus: "unclear",
      customerSummary: "",
      coachSummary: "",
    },
  } as unknown as CoachingDecisionContext;
}

function memoryWithTurns(turns: Array<{ role: "customer" | "coach"; content: string }>): CoachingAiV2MemoryBundle {
  return {
    recentTurns: turns.map((t, i) => ({
      id: `t-${i}`,
      enrollmentId: "enr-nat-1",
      customerId: "cus-nat-1",
      ownerMemberId: "own-1",
      cycleId: null,
      logDate: "2026-08-10",
      turnIndex: i,
      role: t.role,
      channel: "free_message",
      content: t.content,
      contentSummary: null,
      aiOutputId: null,
      intention: null,
      metadata: {},
      createdAt: new Date().toISOString(),
    })) as CoachingAiV2Turn[],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber: 5,
      stage: "find_patterns",
      intensiveActive: true,
      daysRemaining: 16,
    },
  };
}

const fatLossGoal = {
  primaryDirection: "fat_loss_body",
  primaryDirectionLabel: "減脂／體態改善",
  personalGoal: "減脂少吃重口味",
  targetWeightKg: 55,
  originalPersonalGoal: null,
  wasRefined: false,
  guidance: "Protect the live goal.",
};

const hamburgerCoachLine =
  "今天我比較不推漢堡，你炸麵已經吃過了 😂";

describe("Go21 Natural Conversation Layer — move detection", () => {
  it("detects decision when customer says 吃沙拉 after hamburger coaching", () => {
    const move = detectGo21ConversationalMove({
      freeMessage: "吃沙拉",
      recentTurns: [
        { role: "customer", content: "等一下想吃漢堡" },
        { role: "coach", content: hamburgerCoachLine },
      ],
    });
    expect(move?.move).toBe("decision");
    expect(move?.decidedFood).toMatch(/沙拉/);
  });

  it("detects correction 我是說晚餐改成沙拉", () => {
    const move = detectGo21ConversationalMove({
      freeMessage: "我是說晚餐改成沙拉",
      recentTurns: [
        { role: "coach", content: hamburgerCoachLine },
      ],
    });
    expect(move?.move).toBe("correction");
    expect(move?.decidedFood).toMatch(/沙拉/);
  });

  it("detects confirmation / rejection / temporal correction", () => {
    expect(
      detectGo21ConversationalMove({
        freeMessage: "好",
        recentTurns: [{ role: "coach", content: "那晚餐換成沙拉？" }],
      })?.move,
    ).toBe("confirmation");
    expect(
      detectGo21ConversationalMove({
        freeMessage: "算了",
        recentTurns: [{ role: "coach", content: "要不要試試下午點心？" }],
      })?.move,
    ).toBe("rejection");
    expect(
      detectGo21ConversationalMove({
        freeMessage: "我是說明天",
        recentTurns: [{ role: "coach", content: "那今天晚餐換成沙拉？" }],
      })?.move,
    ).toBe("temporal_correction");
  });

  it("detects misunderstanding repair", () => {
    expect(
      detectGo21ConversationalMove({
        freeMessage: "你沒聽懂，我不是要吃漢堡",
        recentTurns: [{ role: "coach", content: hamburgerCoachLine }],
      })?.move,
    ).toBe("misunderstanding_repair");
  });

  it("does not treat a fresh goal-conflict plan as a conversational decision", () => {
    const move = detectGo21ConversationalMove({
      freeMessage: "等一下想吃漢堡",
      recentTurns: [{ role: "coach", content: "今天中午看起來還好。" }],
    });
    // Plan to eat hamburger is coaching territory, not a short decision ack
    expect(move?.move === "decision").toBe(false);
  });
});

describe("Go21 Natural Conversation Layer — multi-turn fixture behavior", () => {
  it("after hamburger coaching, 吃沙拉 is a short decision — no re-analysis", () => {
    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      finalInterventionLevel: "watch",
      memory: memoryWithTurns([
        { role: "customer", content: "等一下想吃漢堡" },
        { role: "coach", content: hamburgerCoachLine },
      ]),
      channel: "free_message",
      freeMessage: "吃沙拉",
      go21Goal: fatLossGoal,
    });
    expect(draft.coachMessage).toMatch(/沙拉/);
    expect(draft.coachMessage).not.toMatch(/漢堡|偏重|蛋白質|熱量|均衡|加油/);
    expect(draft.coachMessage.length).toBeLessThan(30);
    expect(coachMessageSoundsLikeHealthApp(draft.coachMessage)).toBe(false);
  });

  it("correction 我是說晚餐改成沙拉 repairs without nutrition lecture", () => {
    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      finalInterventionLevel: "watch",
      memory: memoryWithTurns([
        { role: "customer", content: "晚餐想吃漢堡" },
        { role: "coach", content: hamburgerCoachLine },
      ]),
      channel: "free_message",
      freeMessage: "我是說晚餐改成沙拉",
      go21Goal: fatLossGoal,
    });
    expect(draft.coachMessage).toMatch(/理解錯了|聽錯/);
    expect(draft.coachMessage).toMatch(/沙拉/);
    expect(draft.coachMessage).not.toMatch(/蛋白質|熱量|均衡|朝著目標|加油/);
    expect(composeGo21NaturalConversationalReply(detectGo21ConversationalMove({
      freeMessage: "我是說晚餐改成沙拉",
      recentTurns: [{ role: "coach", content: hamburgerCoachLine }],
    })!).length).toBeLessThan(60);
  });

  it("confirmation and rejection stay one beat", () => {
    const ok = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      finalInterventionLevel: "normal",
      memory: memoryWithTurns([{ role: "coach", content: "那晚餐換成沙拉？" }]),
      channel: "free_message",
      freeMessage: "好",
    });
    expect(ok.coachMessage.length).toBeLessThan(12);
    expect(ok.coachMessage).not.toMatch(/蛋白質|均衡|加油/);

    const no = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      finalInterventionLevel: "normal",
      memory: memoryWithTurns([{ role: "coach", content: "要不要下午先吃點心？" }]),
      channel: "free_message",
      freeMessage: "不要",
    });
    expect(no.coachMessage).toMatch(/好|先/);
    expect(no.coachMessage).not.toMatch(/蛋白質|目標邁進/);
  });

  it("still challenges on a fresh hamburger plan without health-app pack", () => {
    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      finalInterventionLevel: "coach_attention",
      memory: memoryWithTurns([{ role: "coach", content: "中午收到了。" }]),
      channel: "free_message",
      freeMessage: "等一下想吃漢堡",
      go21Goal: fatLossGoal,
    });
    expect(draft.coachMessage).toMatch(/不推|漢堡|炸/);
    expect(draft.coachMessage).not.toMatch(/蛋白質清楚|雞胸堡|朝著目標邁進/);
    expect(draft.meta.intention).toBe("challenge");
  });

  it("continuation 那雞排呢 gets a short opinion, not a full SOP lecture", () => {
    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      finalInterventionLevel: "normal",
      memory: memoryWithTurns([{ role: "coach", content: hamburgerCoachLine }]),
      channel: "free_message",
      freeMessage: "那雞排呢？",
      go21Goal: fatLossGoal,
    });
    expect(draft.coachMessage).toMatch(/雞排/);
    expect(draft.coachMessage).toMatch(/不推|想吃炸/);
    expect(draft.coachMessage).not.toMatch(/朝著目標邁進|更好地控制整體熱量|考慮搭配一些蛋白質|你是想換成/);
    expect(draft.coachMessage.length).toBeLessThan(45);
  });

  it("user prompt surfaces conversationalMove + humanCoachReply for the live model", () => {
    const user = buildCoachingAiV2UserPrompt({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      memory: memoryWithTurns([
        { role: "customer", content: "等一下想吃漢堡" },
        { role: "coach", content: hamburgerCoachLine },
      ]),
      channel: "free_message",
      freeMessage: "吃沙拉",
      go21Goal: fatLossGoal,
    });
    const parsed = JSON.parse(user);
    expect(parsed.conversationalMove.move).toBe("decision");
    expect(parsed.conversationalMove.decidedFood).toMatch(/沙拉/);
    expect(parsed.humanCoachReply.replyShape).toBe("one_beat");
    expect(user).toMatch(/先接住對話/);
  });

  it("system prompt prioritizes conversational understanding and human coach voice", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(coachingBrainLooksUnscripted(sys)).toBe(true);
    expect(sys).toMatch(/對話動作|先理解對話/);
    expect(sys).toMatch(/朝著目標邁進|考慮搭配一些蛋白質|更好地控制整體熱量/);
    expect(sys).toMatch(/吃沙拉|那雞排呢/);
    expect(sys).toMatch(/Human Coach Voice|今天我不推|今天我比較不推/);
    expect(COACHING_AI_V2_PROMPT_VERSION).toMatch(/human_coach_voice|daily_targets/);
  });

  it("health-app voice detector flags SOP phrases", () => {
    expect(coachMessageSoundsLikeHealthApp("這樣能更均衡，考慮搭配一些蛋白質。")).toBe(true);
    expect(coachMessageSoundsLikeHealthApp("好，那晚餐就沙拉。")).toBe(false);
  });
});
