import { describe, expect, it } from "vitest";
import {
  assessGo21GoalSafety,
  buildGo21GoalSnapshot,
  compactGo21GoalForAi,
  enrollmentNeedsGo21Goal,
  go21GoalDisplayLabel,
  parseGo21GoalRecord,
  toGo21GoalPublicView,
} from "@/lib/go21/goal";
import {
  extractCurrentAndTargetWeightKg,
  detectGo21GoalRefinement,
} from "@/lib/go21/goal-extract";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { lifecycleStageGuidance } from "@/lib/coaching/ai/v2/lifecycle";
import { buildCoachingAiV2SystemPrompt, buildCoachingAiV2UserPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";

describe("Go21 goal model", () => {
  it("does not fabricate numeric target from 「我想瘦一點」", () => {
    const extracted = extractGo21StructuredEvent({
      message: "我想瘦一點",
      messageLogDate: "2026-08-29",
    });
    expect(extracted.targetWeightKg).toBeNull();
    expect(extracted.weightKg).toBeNull();
  });

  it("parses current=70 target=68 from explicit sentence", () => {
    const w = extractCurrentAndTargetWeightKg("我現在70公斤，希望21天先到68");
    expect(w.currentWeightKg).toBe(70);
    expect(w.targetWeightKg).toBe(68);

    const extracted = extractGo21StructuredEvent({
      message: "我現在70公斤，希望21天先到68",
      messageLogDate: "2026-08-29",
    });
    expect(extracted.weightKg).toBe(70);
    expect(extracted.targetWeightKg).toBe(68);
  });

  it("revises target to 69 without treating it as current weight", () => {
    const w = extractCurrentAndTargetWeightKg("68先不要，我覺得69比較實際");
    expect(w.targetWeightKg).toBe(69);
    expect(w.currentWeightKg).toBeNull();

    const extracted = extractGo21StructuredEvent({
      message: "68先不要，我覺得69比較實際",
      messageLogDate: "2026-08-29",
    });
    expect(extracted.targetWeightKg).toBe(69);
    expect(extracted.weightKg).toBeNull();
  });

  it("treats 「胖到70」 as current measurement not target", () => {
    const w = extractCurrentAndTargetWeightKg("我最近胖到70");
    expect(w.currentWeightKg).toBe(70);
    expect(w.targetWeightKg).toBeNull();
  });

  it("preserves original wording and history on refine", () => {
    const original = buildGo21GoalSnapshot({
      primaryDirection: "fat_loss_body",
      personalGoal: "希望腰圍小一點",
      targetWeightKg: 68,
      source: "onboarding",
      setAt: "2026-08-01T00:00:00.000Z",
    });
    const refined = buildGo21GoalSnapshot({
      primaryDirection: "reduce_chaos_eating",
      personalGoal: "晚餐不要再一直失控",
      targetWeightKg: 69,
      source: "chat_confirmed",
      setAt: "2026-08-10T00:00:00.000Z",
    });
    const record = parseGo21GoalRecord({
      version: 1,
      current: refined,
      original,
      history: [{ at: "2026-08-10T00:00:00.000Z", goal: original, reason: "refined" }],
    });
    expect(record?.original.personalGoal).toBe("希望腰圍小一點");
    expect(record?.current.personalGoal).toBe("晚餐不要再一直失控");
    expect(record?.current.targetWeightKg).toBe(69);
    const view = toGo21GoalPublicView(record);
    expect(view?.wasRefined).toBe(true);
    expect(go21GoalDisplayLabel(refined)).toContain("晚餐");
  });

  it("existing placeholder enrollment needs goal; structured goal does not", () => {
    expect(enrollmentNeedsGo21Goal({ goal: "21 天體驗" })).toBe(true);
    expect(enrollmentNeedsGo21Goal({ goal: null })).toBe(true);
    const snap = buildGo21GoalSnapshot({
      primaryDirection: "stable_habits",
      personalGoal: "晚上少亂吃",
      source: "onboarding",
    });
    expect(
      enrollmentNeedsGo21Goal({
        go21GoalJson: { version: 1, current: snap, original: snap, history: [] },
        goal: go21GoalDisplayLabel(snap),
      }),
    ).toBe(false);
  });

  it("blocks clearly unsafe restriction language", () => {
    const unsafe = assessGo21GoalSafety({
      personalGoal: "我想絕食減肥，只喝水",
      targetWeightKg: 42,
      currentWeightKg: 70,
    });
    expect(unsafe.ok).toBe(false);
    expect(unsafe.message).toBeTruthy();
  });

  it("cautions aggressive weight targets without hard-blocking store path", () => {
    const caution = assessGo21GoalSafety({
      personalGoal: "希望瘦一點更輕盈",
      targetWeightKg: 60,
      currentWeightKg: 72,
    });
    expect(caution.ok).toBe(true);
    expect(caution.caution).toBe(true);
  });

  it("detects conversational goal refinement without weak silent overwrite", () => {
    const proposal = detectGo21GoalRefinement(
      "其實我現在覺得體重不是最重要，我比較想把晚餐控制好。",
    );
    expect(proposal).toBeTruthy();
    expect(proposal?.primaryDirection).toBe("reduce_chaos_eating");
    expect(proposal?.needsConfirmation).toBe(true);
  });

  it("public view never exposes history/raw memory internals", () => {
    const snap = buildGo21GoalSnapshot({
      primaryDirection: "energy_lifestyle",
      personalGoal: "希望更有精神",
      source: "onboarding",
    });
    const view = toGo21GoalPublicView({
      version: 1,
      current: snap,
      original: snap,
      history: [{ at: "2026-08-01T00:00:00.000Z", goal: snap, reason: "secret" }],
    });
    expect(view).toBeTruthy();
    expect(view).not.toHaveProperty("history");
    expect(JSON.stringify(view)).not.toMatch(/secret|durableMemory|radar/i);
  });
});

describe("Go21 goal authorization contract", () => {
  it("goal API route scopes by portal token and never trusts client enrollment/customer ids", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      new URL("../../app/api/coaching/portal/[token]/go21/goal/route.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain("requireGo21Portal");
    expect(src).toContain("portal.enrollmentId");
    expect(src).toContain("portal.customerId");
    expect(src).not.toMatch(/body\.enrollmentId|body\.customerId/);
  });

  it("saveGo21Goal rejects mismatched customer/owner (cross-customer isolation)", async () => {
    // Contract: save compares enrollment row to portal-derived ids before write.
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("./goal.ts", import.meta.url), "utf8");
    expect(src).toMatch(/existing\.customer_id !== input\.customerId/);
    expect(src).toMatch(/Forbidden/);
    expect(src).toMatch(/\.eq\("customer_id", input\.customerId\)/);
    expect(src).toMatch(/\.eq\("owner_member_id", input\.ownerMemberId\)/);
  });
});

describe("Go21 goal AI context", () => {
  it("system prompt tells model not to repeat goal every turn", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(sys).toMatch(/記得，但別背誦|不要每則重述目標/);
  });

  it("user prompt includes go21Goal compact block", () => {
    const snap = buildGo21GoalSnapshot({
      primaryDirection: "reduce_chaos_eating",
      personalGoal: "晚上不要亂吃",
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
      memory: minimalMemory(),
      channel: "free_message",
      freeMessage: "今天還可以",
      go21Goal: compactGo21GoalForAi(record),
    });
    expect(prompt).toContain("晚上不要亂吃");
    expect(prompt).toMatch(/currentPersonalGoal|Silent understanding/);
  });

  it("Day 7/14/21 guidance references goal without inventing progress", () => {
    expect(lifecycleStageGuidance("find_patterns")).toMatch(/Day 7/);
    expect(lifecycleStageGuidance("experiment")).toMatch(/Day 14/);
    expect(lifecycleStageGuidance("day21_ending")).toMatch(/original 21-day goal|close the loop/i);
  });

  it("Day 21 fixture uses original wish wording", () => {
    const snap = buildGo21GoalSnapshot({
      primaryDirection: "fat_loss_body",
      personalGoal: "希望腰圍小一點",
      source: "onboarding",
    });
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: {
        ...minimalMemory(),
        lifecycle: {
          ...minimalMemory().lifecycle,
          dayNumber: 21,
          stage: "day21_ending",
          intensiveActive: true,
          daysRemaining: 0,
        },
      },
      channel: "day21",
      go21Goal: compactGo21GoalForAi({
        version: 1,
        current: snap,
        original: snap,
        history: [],
      }),
    });
    expect(draft.coachMessage).toMatch(/希望腰圍小一點|21 天前/);
    expect(draft.coachMessage).not.toMatch(/恭喜完成21天挑戰/);
  });
});

function minimalGenerationInput(): CoachingGenerationInput {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate: "2026-08-21",
    enrollmentId: "enr-goal",
    customerId: "cus-goal",
    profileMemory: {
      displayName: "測試",
      goal: "21 天體驗",
      daysSinceEnrollmentStart: 21,
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
      daysSinceEnrollmentStart: 21,
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
        daysSinceEnrollmentStart: 21,
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

function minimalMemory(): CoachingAiV2MemoryBundle {
  return {
    recentTurns: [],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber: 10,
      stage: "experiment",
      intensiveActive: true,
      daysRemaining: 11,
    },
  };
}
