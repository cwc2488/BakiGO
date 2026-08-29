import { describe, expect, it } from "vitest";
import {
  go21SystemPromptAllowsTimelyConcreteTip,
  go21SystemPromptIncludesShortPolicy,
  go21SystemPromptPrefersConciseDefault,
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
    expect(craving.coachMessage.split("\n").length).toBeLessThanOrEqual(3);
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
    expect(src).toContain("if (programmaticScrollRef.current) return");
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
      stage: "find_patterns" as const,
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
