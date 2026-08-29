import { describe, expect, it } from "vitest";
import {
  assessGo21Disengagement,
  buildGo21CustomerDisplayContent,
  detectPhotoFoodCorrection,
  enrichTurnContentForAi,
  go21SystemPromptAllowsFoodLogRestraint,
  go21SystemPromptAllowsMetaFeedback,
  go21SystemPromptAllowsNoQuestion,
  go21SystemPromptAllowsOffTopicHuman,
  go21SystemPromptAllowsTimelyConcreteTip,
  go21SystemPromptHandlesDisengagement,
  go21SystemPromptIncludesShortPolicy,
  go21SystemPromptPrefersConciseDefault,
  nextClientRequestId,
} from "@/lib/go21/conversation-quality";
import {
  buildCoachingAiV2SystemPrompt,
  buildCoachingAiV2UserPrompt,
  coachingBrainLooksUnscripted,
} from "@/lib/coaching/ai/v2/v2-prompts";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { buildGo21CoachGenerationContext, isChatNearBottom } from "@/lib/go21/coach-context";
import { buildGo21GoalSnapshot, parseGo21GoalRecord } from "@/lib/go21/goal";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Go21 Coaching Brain V3 — prompt architecture", () => {
  it("system prompt is principle-based, not SOP-scripted", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(coachingBrainLooksUnscripted(sys)).toBe(true);
    expect(go21SystemPromptIncludesShortPolicy(sys)).toBe(true);
    expect(go21SystemPromptAllowsNoQuestion(sys)).toBe(true);
    expect(go21SystemPromptAllowsFoodLogRestraint(sys)).toBe(true);
    expect(go21SystemPromptAllowsOffTopicHuman(sys)).toBe(true);
    expect(go21SystemPromptAllowsMetaFeedback(sys)).toBe(true);
    expect(go21SystemPromptHandlesDisengagement(sys)).toBe(true);
    expect(go21SystemPromptPrefersConciseDefault(sys)).toBe(true);
    expect(go21SystemPromptAllowsTimelyConcreteTip(sys)).toBe(true);
    expect(sys).not.toMatch(/30–80/);
    expect(sys).not.toMatch(/SHORT FIRST/);
    expect(sys).not.toMatch(/肯定\s*→\s*分析\s*→\s*建議/);
  });
});

describe("Go21 Coaching Brain V3 — behavior fixtures", () => {
  it("TEST 1 — simple food log may only acknowledge", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(2),
      channel: "free_message",
      freeMessage: "晚餐吃了滷肉飯",
    });
    expect(draft.coachMessage).toMatch(/滷肉飯|收到/);
    expect(draft.coachMessage).not.toMatch(/蔬菜|蛋白質|更均衡|減脂目標|可以考慮/);
  });

  it("TEST 2 — repeated pattern allows pattern-level observation", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: {
        ...minimalDecision(),
        mealObservations: [
          {
            mealSlot: "dinner",
            observedFoods: ["大量晚餐"],
            signals: ["large_portion", "late_meal"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "medium",
          },
        ],
        customerVoice: [
          {
            key: "hunger_reported",
            rawExcerpt: "下午沒吃",
            evidence: [],
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory: {
        ...emptyMemory(6),
        durableMemory: [
          {
            id: "m1",
            enrollmentId: "enr",
            customerId: "c",
            ownerMemberId: "o",
            cycleId: null,
            category: "pattern",
            content: "下午常沒吃，傍晚容易餓",
            evidenceSummary: null,
            confidence: 0.6,
            sourceLogDate: "2026-08-27",
            sourceTurnId: null,
            status: "active",
            createdAt: "2026-08-27T00:00:00.000Z",
            updatedAt: "2026-08-27T00:00:00.000Z",
          },
        ],
      },
      channel: "free_message",
      freeMessage: "晚上又餓爆了",
    });
    expect(draft.coachMessage).toMatch(/下午|模式|餓爆|空太久/);
  });

  it("TEST 3 — goal reaches generation context and can influence reasoning", () => {
    const original = buildGo21GoalSnapshot({
      primaryDirection: "fat_loss_body",
      personalGoal: "想瘦一點",
      source: "onboarding",
    });
    const current = buildGo21GoalSnapshot({
      primaryDirection: "reduce_chaos_eating",
      personalGoal: "我希望這21天把晚上一直吃宵夜的習慣改善掉。",
      source: "chat_confirmed",
    });
    const record = parseGo21GoalRecord({
      version: 1,
      current,
      original,
      history: [{ at: "2026-08-10T00:00:00.000Z", goal: original, reason: "refined" }],
    });
    const coachCtx = buildGo21CoachGenerationContext({ goalRecord: record });
    expect(coachCtx.goalReachedGenerationContext).toBe(true);
    expect(coachCtx.currentPersonalGoal).toContain("宵夜");
    expect(coachCtx.originalPersonalGoal).toBe("想瘦一點");
    expect(coachCtx.wasRefined).toBe(true);

    const prompt = buildCoachingAiV2UserPrompt({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      memory: emptyMemory(10),
      channel: "free_message",
      freeMessage: "突然超想吃東西",
      go21Goal: coachCtx.go21Goal,
    });
    const parsed = JSON.parse(prompt) as {
      go21Goal: { currentPersonalGoal: string; originalPersonalGoal: string | null };
    };
    expect(parsed.go21Goal.currentPersonalGoal).toContain("宵夜");
    expect(parsed.go21Goal.originalPersonalGoal).toBe("想瘦一點");

    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(10),
      channel: "free_message",
      freeMessage: "突然超想吃東西",
      go21Goal: coachCtx.go21Goal,
    });
    expect(draft.coachMessage).toMatch(/晚上|餓|茶|水/);
    expect(draft.coachMessage).toMatch(/茶|水|撐/);
    expect(draft.coachMessage).not.toMatch(/因為你的21天目標/);
  });

  it("TEST 4 — off-topic human moment is not forced to nutrition", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(4),
      channel: "free_message",
      freeMessage: "我有女朋友，但是她都不理我",
    });
    expect(draft.coachMessage).not.toMatch(/飲食計畫|減脂目標|今天的飲食/);
    expect(draft.coachMessage.length).toBeLessThan(60);
  });

  it("TEST 5 — meta feedback is casual, not corporate", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(4),
      channel: "free_message",
      freeMessage: "你感覺還是很機器人，不像AI",
    });
    expect(draft.coachMessage).toMatch(/抓到|腳本|😂/);
    expect(draft.coachMessage).not.toMatch(/我在這裡是為了|達成目標|感到機器化/);
  });

  it("TEST 6 — explicit information request may be longer", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(5),
      channel: "free_message",
      freeMessage: "蛋白質為什麼對減脂有幫助？",
    });
    expect(draft.coachMessage.length).toBeGreaterThan(40);
    expect(draft.coachMessage).toMatch(/蛋白|飽足|肌肉/);
  });

  it("TEST 8 — retry reuses same clientRequestId helper", () => {
    const first = nextClientRequestId(null);
    const again = nextClientRequestId(first);
    expect(again).toBe(first);
    const src = readFileSync(resolve(process.cwd(), "src/components/go21/Go21App.tsx"), "utf8");
    expect(src).toContain("retry");
    expect(src).toContain("failedPayloadRef");
    expect(src).toContain("clientRequestId");
  });

  it("TEST 9/10 — near-bottom auto-follow vs history preservation", () => {
    expect(
      isChatNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 80, thresholdPx: 96 }),
    ).toBe(true);
    expect(
      isChatNearBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 80, thresholdPx: 96 }),
    ).toBe(false);
    const src = readFileSync(resolve(process.cwd(), "src/components/go21/Go21App.tsx"), "utf8");
    expect(src).toContain("stickToBottomRef");
    expect(src).toContain("最新訊息");
    expect(src).toContain("onThreadScroll");
    expect(src).toContain("followLatestConversation");
    expect(src).toContain("programmaticScrollRef");
    // Active send pins to latest
    expect(src).toMatch(/setPendingUser[\s\S]{0,200}followLatestConversation/);
  });

  it("TEST 11 — refined current goal wins over original", () => {
    const ctx = buildGo21CoachGenerationContext({
      go21GoalJson: {
        version: 1,
        current: buildGo21GoalSnapshot({
          primaryDirection: "reduce_chaos_eating",
          personalGoal: "Goal B — 晚餐控制",
          source: "ui_edit",
        }),
        original: buildGo21GoalSnapshot({
          primaryDirection: "fat_loss_body",
          personalGoal: "Goal A — 想瘦",
          source: "onboarding",
        }),
        history: [],
      },
    });
    expect(ctx.currentPersonalGoal).toBe("Goal B — 晚餐控制");
    expect(ctx.originalPersonalGoal).toBe("Goal A — 想瘦");
    expect(ctx.wasRefined).toBe(true);
  });

  it("TEST 12 — no-goal enrollment stays compatible", () => {
    const ctx = buildGo21CoachGenerationContext({ go21GoalJson: null });
    expect(ctx.goalReachedGenerationContext).toBe(false);
    expect(ctx.go21Goal).toBeNull();
  });

  it("TEST 13 — vision continuity preserved", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(3),
      channel: "free_message",
      freeMessage: "我剛剛拍了什麼？",
      recentVisionObservations: [{ summary: "看起來像紅茶", correction: null }],
    });
    expect(draft.coachMessage).toMatch(/紅茶/);
  });

  it("TEST 14 — casual short reply path does not block structured extraction", () => {
    const extracted = extractGo21StructuredEvent({
      message: "晚餐吃了滷肉飯",
      messageLogDate: "2026-08-29",
    });
    expect(extracted.mealSlot === "dinner" || extracted.mealNote).toBeTruthy();
  });

  it("TEST 7 — send failure UX is present in client", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/go21/Go21App.tsx"), "utf8");
    expect(src).toContain('sendStatus === "failed"');
    expect(src).toContain("還沒送出成功");
    expect(src).toContain("重試");
    expect(src).toContain("AbortController");
  });
});

describe("Go21 conversation quality — persistence projection", () => {
  it("display content separates customer text/photo from vision blobs", () => {
    expect(buildGo21CustomerDisplayContent({ message: "今天下午很想吃甜的", hasPhoto: false })).toBe(
      "今天下午很想吃甜的",
    );
    expect(buildGo21CustomerDisplayContent({ message: "", hasPhoto: true })).toBe("📷 照片");
    const aiFacing = enrichTurnContentForAi({
      displayContent: "📷 照片",
      visionEvidenceSummary: "看起來像紅茶",
    });
    expect(aiFacing).toContain("紅茶");
  });

  it("disengagement stays brief", () => {
    const assessment = assessGo21Disengagement("我覺得很沒信心，我想結束這個陪跑了");
    expect(assessment.detected).toBe(true);
    expect(assessment.briefReply!.length).toBeLessThan(80);
  });

  it("photo correction detection still works", () => {
    expect(detectPhotoFoodCorrection("那不是奶茶，是無糖紅茶")).toBe("無糖紅茶");
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
      stage: (dayNumber <= 3
        ? "understand"
        : dayNumber <= 7
          ? "find_patterns"
          : dayNumber <= 14
            ? "experiment"
            : "build_autonomy") as
        | "understand"
        | "find_patterns"
        | "experiment"
        | "build_autonomy",
      intensiveActive: true,
      daysRemaining: Math.max(0, 21 - dayNumber),
    },
  };
}

function minimalGenerationInput(): CoachingGenerationInput {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate: "2026-08-29",
    enrollmentId: "enr-v3",
    customerId: "cus-v3",
    profileMemory: {
      displayName: "測試",
      goal: "改善晚上容易失控吃宵夜",
      daysSinceEnrollmentStart: 3,
      planSnapshot: DEFAULT_COACHING_PLAN_SNAPSHOT,
      sex: null,
      birthYear: null,
      heightCm: null,
    },
    todayContext: {
      submitted: true,
      primaryMeals: [
        { mealSlot: "breakfast", textNote: null, storagePath: null },
        { mealSlot: "lunch", textNote: null, storagePath: null },
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
    rollingMemory: { recurringPatterns: [], recentNotes: [] },
    priorAiContext: null,
  } as unknown as CoachingGenerationInput;
}

function minimalDecision(): CoachingDecisionContext {
  return {
    signals: [],
    positiveSignals: [],
    priorities: [],
    recurringIssue: null,
    improvedIssue: null,
    coachAttention: { required: false, reason: null, evidence: [] },
    finalInterventionLevel: "normal",
    customerVoice: [],
    mealObservations: [],
    photoReuse: [],
    pendingFollowUps: [],
    dailyNutritionAssessment: assessDailyNutrition({ mealObservations: [] }),
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
      goalType: "general",
      goalLabel: "陪跑目標",
      measurementStage: "baseline_only",
      baselineDate: null,
      latestMeasurementDate: null,
      measurementCount: 0,
      daysSinceBaseline: null,
      daysSinceLatestMeasurement: null,
      daysSinceEnrollmentStart: 3,
      goalRelevantMetrics: [],
    },
    outcomeAssessment: {
      goalContext: {
        goalType: "general",
        goalLabel: "陪跑目標",
        measurementStage: "baseline_only",
        baselineDate: null,
        latestMeasurementDate: null,
        measurementCount: 0,
        daysSinceBaseline: null,
        daysSinceLatestMeasurement: null,
        daysSinceEnrollmentStart: 3,
        goalRelevantMetrics: [],
      },
      comparison: null,
      outcomeStatus: "not_yet_measurable",
      trendStatus: "insufficient_data",
      periods: [],
      reasons: [],
      evidence: [],
      customerSummary: "",
    },
  } as CoachingDecisionContext;
}
