import { describe, expect, it } from "vitest";
import {
  assessGo21Disengagement,
  buildGo21CustomerDisplayContent,
  detectPhotoFoodCorrection,
  enrichTurnContentForAi,
  go21SystemPromptAllowsNoQuestion,
  go21SystemPromptHandlesDisengagement,
  go21SystemPromptIncludesShortPolicy,
} from "@/lib/go21/conversation-quality";
import { buildCoachingAiV2SystemPrompt, buildCoachingAiV2UserPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { CoachingAiV2MemoryStore } from "@/lib/coaching/ai/v2/memory-store";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";
import { compactGo21GoalForAi, buildGo21GoalSnapshot, parseGo21GoalRecord } from "@/lib/go21/goal";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Go21 conversation quality — persistence projection", () => {
  it("TEST A/B — display content separates customer text/photo from vision blobs", () => {
    expect(buildGo21CustomerDisplayContent({ message: "今天下午很想吃甜的", hasPhoto: false })).toBe(
      "今天下午很想吃甜的",
    );
    expect(buildGo21CustomerDisplayContent({ message: "", hasPhoto: true })).toBe("📷 照片");
    const aiFacing = enrichTurnContentForAi({
      displayContent: "📷 照片",
      visionEvidenceSummary: "看起來像紅茶",
    });
    expect(aiFacing).toContain("紅茶");
    expect(aiFacing).toContain("近期影像觀察");
    // UI display stays clean
    expect(buildGo21CustomerDisplayContent({ message: "", hasPhoto: true })).not.toContain("影像觀察");
  });

  it("in-memory store keeps customer + coach exactly once for a turn pair", async () => {
    const store = new CoachingAiV2MemoryStore();
    await store.appendTurn({
      enrollmentId: "enr-cq",
      customerId: "cus",
      ownerMemberId: "own",
      logDate: "2026-08-29",
      role: "customer",
      channel: "free_message",
      content: "今天下午很想吃甜的",
    });
    await store.appendTurn({
      enrollmentId: "enr-cq",
      customerId: "cus",
      ownerMemberId: "own",
      logDate: "2026-08-29",
      role: "coach",
      channel: "free_message",
      content: "嗯，我聽到了。",
    });
    const bundle = await store.loadMemoryBundle({ enrollmentId: "enr-cq", logDate: "2026-08-29" });
    const customers = bundle.recentTurns.filter((t) => t.role === "customer");
    const coaches = bundle.recentTurns.filter((t) => t.role === "coach");
    expect(customers).toHaveLength(1);
    expect(coaches).toHaveLength(1);
    expect(customers[0]!.content).toBe("今天下午很想吃甜的");
  });
});

describe("Go21 conversation quality — vision continuity + correction", () => {
  it("TEST C — next turn can answer what was photographed from recent vision", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: {
        recentTurns: [
          {
            id: "t1",
            enrollmentId: "enr",
            customerId: "c",
            ownerMemberId: "o",
            cycleId: null,
            logDate: "2026-08-29",
            turnIndex: 1,
            role: "customer",
            channel: "photo",
            content: "📷 照片\n[近期影像觀察｜非已確認事實] 看起來像紅茶",
            contentSummary: "看起來像紅茶",
            aiOutputId: null,
            intention: null,
            metadata: { visionEvidenceSummary: "看起來像紅茶" },
            createdAt: "2026-08-29T10:00:00.000Z",
          },
        ],
        durableMemory: [],
        openLoops: [],
        hypotheses: [],
        lifecycle: {
          cycle: null,
          dayNumber: 3,
          stage: "understand",
          intensiveActive: true,
          daysRemaining: 18,
        },
      },
      channel: "free_message",
      freeMessage: "我剛剛拍了什麼給你？",
      recentVisionObservations: [{ summary: "看起來像紅茶", correction: null }],
    });
    expect(draft.coachMessage).toMatch(/紅茶/);
    expect(draft.coachMessage.length).toBeLessThan(40);
  });

  it("TEST D — customer correction wins over prior vision label", () => {
    expect(detectPhotoFoodCorrection("那不是奶茶，是無糖紅茶")).toBe("無糖紅茶");
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: {
        recentTurns: [],
        durableMemory: [],
        openLoops: [],
        hypotheses: [],
        lifecycle: {
          cycle: null,
          dayNumber: 3,
          stage: "understand",
          intensiveActive: true,
          daysRemaining: 18,
        },
      },
      channel: "free_message",
      freeMessage: "我剛剛拍了什麼？",
      recentVisionObservations: [
        { summary: "看起來像奶茶", correction: "無糖紅茶" },
      ],
    });
    expect(draft.coachMessage).toMatch(/無糖紅茶/);
    expect(draft.coachMessage).not.toMatch(/^奶茶/);
  });
});

describe("Go21 conversation quality — idempotency + policy", () => {
  it("TEST E — chat route honors clientRequestId idempotency contract", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/coaching/portal/[token]/go21/chat/route.ts"),
      "utf8",
    );
    expect(src).toContain("clientRequestId");
    expect(src).toContain("findGo21TurnsByClientRequestId");
    expect(src).toContain("acceptGo21CustomerTurn");
    expect(src).toContain("duplicate: true");
    const persist = readFileSync(
      resolve(process.cwd(), "src/lib/coaching/ai/v2/v2-supabase-store.ts"),
      "utf8",
    );
    expect(persist).toContain('role: "customer"');
    expect(persist).toContain("customerDisplayContent");
  });

  it("TEST F — short response policy is in system prompt; photo reply stays concise", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(go21SystemPromptIncludesShortPolicy(sys)).toBe(true);
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(2),
      channel: "free_message",
      freeMessage: "（傳了一張餐點照片）\n\n[影像觀察｜僅供教練參考，非已確認事實]\n看起來像紅茶",
    });
    expect(draft.coachMessage.length).toBeLessThan(80);
    expect(draft.coachMessage).not.toMatch(/減脂目標|蛋白質和蔬菜|這會有助於/);
  });

  it("TEST G — question optionality encoded; simple ack may have no question", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(go21SystemPromptAllowsNoQuestion(sys)).toBe(true);
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(5),
      channel: "free_message",
      freeMessage: "好，先這樣",
    });
    expect(draft.coachMessage).not.toMatch(/你覺得怎麼樣|隨時跟我分享|有什麼想法嗎/);
  });

  it("TEST H — disengagement is brief, not a motivational essay", () => {
    const assessment = assessGo21Disengagement("我覺得很沒信心，我想結束這個陪跑了");
    expect(assessment.detected).toBe(true);
    expect(assessment.wantsToStop).toBe(true);
    expect(assessment.briefReply).toBeTruthy();
    expect(assessment.briefReply!.length).toBeLessThan(80);
    expect(assessment.briefReply).not.toMatch(/你可以的|加油|堅持下去|一起完成/);

    const sys = buildCoachingAiV2SystemPrompt();
    expect(go21SystemPromptHandlesDisengagement(sys)).toBe(true);

    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(8),
      channel: "free_message",
      freeMessage: "我覺得很沒信心，我想結束這個陪跑了",
    });
    expect(draft.coachMessage.length).toBeLessThan(90);
    expect(draft.coachMessage).not.toMatch(/一定可以|相信自己|堅持到最後/);
  });

  it("TEST I — goal is in context without requiring verbatim restatement", () => {
    const snap = buildGo21GoalSnapshot({
      primaryDirection: "reduce_chaos_eating",
      personalGoal: "改善晚上容易失控吃宵夜",
      source: "onboarding",
    });
    const record = parseGo21GoalRecord({
      version: 1,
      current: snap,
      original: snap,
      history: [],
    });
    const prompt = buildCoachingAiV2UserPrompt({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      memory: emptyMemory(10),
      channel: "free_message",
      freeMessage: "晚上十一點突然超想吃東西",
      go21Goal: compactGo21GoalForAi(record),
    });
    expect(prompt).toContain("改善晚上容易失控吃宵夜");
    expect(prompt).toMatch(/currentPersonalGoal|Silent understanding/);
    const sys = buildCoachingAiV2SystemPrompt();
    expect(sys).toMatch(/記得，但別背誦|不要每則重述目標/);
  });

  it("TEST J — photo input supports camera AND library (no forced capture-only)", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/go21/Go21App.tsx"), "utf8");
    expect(src).toContain("拍照");
    expect(src).toContain("從相簿選擇");
    expect(src).toContain('capture="environment"');
    // Library input must exist without capture
    expect(src).toMatch(/libraryRef[\s\S]*accept="image\/\*[\s\S]*hidden/);
    expect(src).toMatch(/cameraRef[\s\S]*capture="environment"/);
    // First-entry human copy
    expect(src).toContain("開始 Day 1");
    expect(src).not.toContain("🤖 AI 幫你整理");
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
      stage: "understand" as const,
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
    enrollmentId: "enr-cq",
    customerId: "cus-cq",
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
