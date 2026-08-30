import { describe, expect, it } from "vitest";
import {
  buildGo21HumanCoachReplyContract,
  coachMessageLooksLikeHealthAppStructure,
} from "@/lib/go21/human-coach-voice";
import {
  coachMessageSoundsLikeHealthApp,
  detectGo21ConversationalMove,
} from "@/lib/go21/conversational-move";
import {
  buildCoachingAiV2SystemPrompt,
  buildCoachingAiV2UserPrompt,
  coachingBrainLooksUnscripted,
} from "@/lib/coaching/ai/v2/v2-prompts";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import {
  go21SystemPromptProtectsCustomerGoal,
  go21SystemPromptUsesHumanCoachVoice,
  coachMessageEndsWithQuestion,
} from "@/lib/go21/conversation-quality";
import { COACHING_AI_V2_PROMPT_VERSION } from "@/types/coaching-ai-v2";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle, CoachingAiV2Turn } from "@/types/coaching-ai-v2";

function gi(lunchNote = "炸麵"): CoachingGenerationInput {
  return {
    enrollmentId: "enr-human-1",
    customerId: "cus-human-1",
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
        { mealSlot: "lunch", textNote: lunchNote, storagePath: null },
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

function memoryWithTurns(
  turns: Array<{ role: "customer" | "coach"; content: string }>,
): CoachingAiV2MemoryBundle {
  return {
    recentTurns: turns.map((t, i) => ({
      id: `t-${i}`,
      enrollmentId: "enr-human-1",
      customerId: "cus-human-1",
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
  guidance: "Protect the live goal with professional judgment.",
};

const priorCoachOpinion = "今天我比較不推漢堡，你炸麵已經吃過了 😂";

function draft(freeMessage: string, turns: Array<{ role: "customer" | "coach"; content: string }>) {
  return generateFixtureV2Draft({
    generationInput: gi(),
    decisionContext: decisionHeavyLunch(),
    finalInterventionLevel: "watch",
    memory: memoryWithTurns(turns),
    channel: "free_message",
    freeMessage,
    go21Goal: fatLossGoal,
  });
}

function assertHumanFacing(message: string, opts?: { maxLen?: number; allowQuestion?: boolean }) {
  expect(coachMessageSoundsLikeHealthApp(message)).toBe(false);
  expect(coachMessageLooksLikeHealthAppStructure(message)).toBe(false);
  expect(message.length).toBeLessThan(opts?.maxLen ?? 60);
  if (!opts?.allowQuestion) {
    expect(coachMessageEndsWithQuestion(message)).toBe(false);
  }
}

describe("Go21 Human Coach Voice — prompt contract", () => {
  it("system prompt teaches human coach voice without SOP skeleton", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(coachingBrainLooksUnscripted(sys)).toBe(true);
    expect(go21SystemPromptUsesHumanCoachVoice(sys)).toBe(true);
    expect(go21SystemPromptProtectsCustomerGoal(sys)).toBe(true);
    expect(sys).toMatch(/那雞排呢/);
    expect(sys).toMatch(/今天我不推|今天我比較不推/);
    expect(sys).not.toMatch(/主動建議換成蛋白質清楚/);
    expect(sys).not.toMatch(/點出今天整體模式，並給一個更好的下一步選擇/);
    expect(COACHING_AI_V2_PROMPT_VERSION).toMatch(/human_coach_voice|daily_targets|coach_plan/);
  });

  it("user prompt injects humanCoachReply shape for live model", () => {
    const user = buildCoachingAiV2UserPrompt({
      generationInput: gi(),
      decisionContext: decisionHeavyLunch(),
      memory: memoryWithTurns([{ role: "coach", content: priorCoachOpinion }]),
      channel: "free_message",
      freeMessage: "那雞排呢？",
      go21Goal: fatLossGoal,
    });
    const parsed = JSON.parse(user);
    expect(parsed.conversationalMove.move).toBe("continuation");
    expect(parsed.humanCoachReply.replyShape).toBe("short_opinion");
    expect(parsed.humanCoachReply.lengthHint).toBe("one_sentence");
    expect(parsed.humanCoachReply.doNotForce).toEqual(
      expect.arrayContaining(["風險說明", "營養教育", "替代建議"]),
    );
    expect(parsed.decisionContext.dailyNutritionLevel).toBeUndefined();
    expect(parsed.decisionContext.note).toMatch(/不是要你念出營養報告/);
    expect(parsed.instructions.join(" ")).toMatch(/humanCoachReply/);
  });

  it("flags packed health-app structure, not only slogan phrases", () => {
    expect(
      coachMessageLooksLikeHealthAppStructure(
        "雞排會影響你的減脂目標。建議搭配蔬菜，換成蛋白質清楚的選項會更好地控制整體熱量，加油！",
      ),
    ).toBe(true);
    expect(coachMessageLooksLikeHealthAppStructure("今天我比較不推雞排，你中午已經吃炸的了 😂")).toBe(
      false,
    );
  });
});

describe("Go21 Human Coach Voice — realistic short turns", () => {
  it("那雞排呢 — short opinion, not nutrition lecture", () => {
    const d = draft("那雞排呢？", [{ role: "coach", content: priorCoachOpinion }]);
    expect(d.coachMessage).toMatch(/雞排/);
    expect(d.coachMessage).toMatch(/不推|想吃炸/);
    assertHumanFacing(d.coachMessage);
    expect(d.coachMessage).not.toMatch(/蛋白質|均衡|熱量|加油|搭配蔬菜/);
  });

  it("算了 / 好啦 — one-beat ack", () => {
    expect(draft("算了", [{ role: "coach", content: "要不要試試沙拉？" }]).coachMessage).toMatch(
      /好|先/,
    );
    expect(draft("好啦", [{ role: "coach", content: "那飲料先別甜的。" }]).coachMessage.length).toBeLessThan(
      8,
    );
  });

  it("可是我很想吃 — compromise, not lecture", () => {
    const d = draft("可是我很想吃", [
      { role: "customer", content: "那雞排呢？" },
      { role: "coach", content: "今天我比較不推雞排，你炸麵已經吃過了 😂" },
    ]);
    expect(d.coachMessage).toMatch(/知道|想吃|飲料|別/);
    assertHumanFacing(d.coachMessage);
  });

  it("那明天呢 — short temporal handoff", () => {
    const d = draft("那明天呢？", [{ role: "coach", content: priorCoachOpinion }]);
    expect(d.coachMessage).toMatch(/明天/);
    assertHumanFacing(d.coachMessage);
  });

  it("不要雞胸肉 — remember preference, don't push", () => {
    const d = draft("不要雞胸肉", [{ role: "coach", content: "可以換成雞胸或魚。" }]);
    expect(d.coachMessage).toMatch(/雞胸|魚|蛋/);
    expect(d.coachMessage).not.toMatch(/蛋白質清楚|均衡|加油/);
    assertHumanFacing(d.coachMessage);
  });

  it("我今天就是想放縱 — allow with one boundary", () => {
    const d = draft("我今天就是想放縱", [{ role: "coach", content: "今天先穩一點。" }]);
    expect(d.coachMessage).toMatch(/可以|放縱|飲料/);
    assertHumanFacing(d.coachMessage);
  });

  it("你覺得呢 — direct opinion", () => {
    const d = draft("你覺得呢？", [
      { role: "customer", content: "晚上想吃雞排" },
      { role: "coach", content: priorCoachOpinion },
    ]);
    expect(d.coachMessage).toMatch(/不推|可以|覺得/);
    assertHumanFacing(d.coachMessage);
  });

  it("fresh heavy plan still challenges, without health-app pack", () => {
    const d = draft("等一下想吃漢堡", [{ role: "coach", content: "中午收到了。" }]);
    expect(d.coachMessage).toMatch(/不推|漢堡|炸/);
    expect(d.meta.intention).toBe("challenge");
    assertHumanFacing(d.coachMessage, { maxLen: 50 });
    expect(d.coachMessage).not.toMatch(/蛋白質清楚|雞胸堡|生菜包肉|清湯麵/);
  });

  it("different turns produce different lengths and attitudes", () => {
    const lengths = [
      draft("好", [{ role: "coach", content: "那晚餐換成沙拉？" }]).coachMessage.length,
      draft("那雞排呢？", [{ role: "coach", content: priorCoachOpinion }]).coachMessage.length,
      draft("為什麼蛋白質有幫助？", [{ role: "coach", content: "嗯。" }]).coachMessage.length,
    ];
    expect(lengths[0]).toBeLessThan(12);
    expect(lengths[1]).toBeGreaterThan(lengths[0]!);
    expect(lengths[2]).toBeGreaterThan(40);
  });

  it("reply contract maps short turns to short shapes", () => {
    expect(
      buildGo21HumanCoachReplyContract({
        freeMessage: "算了",
        recentTurns: [{ role: "coach", content: "要不要下午點心？" }],
      }).replyShape,
    ).toBe("short_ack");
    expect(
      buildGo21HumanCoachReplyContract({
        freeMessage: "那雞排呢？",
        recentTurns: [{ role: "coach", content: priorCoachOpinion }],
        alreadyHeavyToday: true,
      }).replyShape,
    ).toBe("short_opinion");
    expect(
      detectGo21ConversationalMove({
        freeMessage: "那雞排呢？",
        recentTurns: [{ role: "coach", content: priorCoachOpinion }],
      })?.move,
    ).toBe("continuation");
  });
});
