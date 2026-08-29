import { describe, expect, it, vi } from "vitest";
import {
  normalizeCoachingAiV2Intention,
  COACHING_AI_V2_INTENTION_FALLBACK,
} from "@/lib/coaching/ai/v2/intention-normalize";
import { parseCoachingAiV2Generation } from "@/lib/coaching/ai/v2/v2-output-schema";
import { COACHING_AI_V2_INTENTIONS } from "@/types/coaching-ai-v2";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { buildCoachingAiV2SystemPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { buildGo21CoachGenerationContext } from "@/lib/go21/coach-context";
import { buildGo21GoalSnapshot, parseGo21GoalRecord } from "@/lib/go21/goal";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function validMeta(overrides: Record<string, unknown> = {}) {
  return {
    intention: "acknowledge",
    lifecycle_day: 9,
    lifecycle_stage: "find_patterns",
    memory_writes: [],
    open_loop_ops: [],
    hypothesis_ops: [],
    safety_triggered: false,
    escalation_suggested: false,
    escalation_reason: null,
    day21_reflection: null,
    ...overrides,
  };
}

describe("Go21 schema move compatibility — normalization", () => {
  it("keeps canonical intentions unchanged", () => {
    for (const intention of COACHING_AI_V2_INTENTIONS) {
      const r = normalizeCoachingAiV2Intention({ raw: intention });
      expect(r.intention).toBe(intention);
      expect(r.normalized).toBe(false);
    }
  });

  it("maps V3 conversational synonyms (confirm/clarify/coach/wait)", () => {
    expect(normalizeCoachingAiV2Intention({ raw: "confirm" }).intention).toBe("acknowledge");
    expect(normalizeCoachingAiV2Intention({ raw: "clarify" }).intention).toBe("investigate");
    expect(normalizeCoachingAiV2Intention({ raw: "coach" }).intention).toBe("educate");
    expect(normalizeCoachingAiV2Intention({ raw: "wait" }).intention).toBe("casual");
    expect(normalizeCoachingAiV2Intention({ raw: "好奇" }).intention).toBe("investigate");
    expect(normalizeCoachingAiV2Intention({ raw: "糾正" }).intention).toBe("educate");
  });

  it("TEST 4 — unknown noncritical move falls back without killing reply", () => {
    const r = normalizeCoachingAiV2Intention({ raw: "hold_space_vibes" });
    expect(r.intention).toBe(COACHING_AI_V2_INTENTION_FALLBACK);
    expect(r.normalized).toBe(true);
    expect(r.reason).toBe("fallback");
  });

  it("TEST 6 — safety/escalation stay strict", () => {
    expect(
      normalizeCoachingAiV2Intention({
        raw: "hold_space_vibes",
        safetyTriggered: true,
      }).intention,
    ).toBe("detect_risk");
    expect(
      normalizeCoachingAiV2Intention({
        raw: "casual",
        escalationSuggested: true,
      }).intention,
    ).toBe("escalate");
    expect(
      normalizeCoachingAiV2Intention({
        raw: "escalate",
        safetyTriggered: true,
        escalationSuggested: true,
      }).intention,
    ).toBe("escalate");
  });
});

describe("Go21 schema move compatibility — parse boundary", () => {
  it("TEST 1 — production repro payload with free V3 move preserves assistant text", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const parsed = parseCoachingAiV2Generation({
      coach_message: "好呀，明天好好享受就好，回來跟我說感覺怎樣。",
      meta: validMeta({ intention: "confirm" }),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.coachMessage).toContain("好好享受");
    expect(parsed.data.meta.intention).toBe("acknowledge");
    spy.mockRestore();
  });

  it("TEST 2 — simple food log with unknown move still parses", () => {
    const parsed = parseCoachingAiV2Generation({
      coach_message: "收到，滷肉飯。",
      meta: validMeta({ intention: "minimal" }),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.coachMessage).toBe("收到，滷肉飯。");
    expect(parsed.data.meta.intention).toBe("casual");
  });

  it("TEST 3 — meta feedback move survives", () => {
    const parsed = parseCoachingAiV2Generation({
      coach_message: "哈哈被你抓到了，我講白話一點。",
      meta: validMeta({ intention: "relate" }),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.meta.intention).toBe("casual");
    expect(parsed.data.coachMessage).toContain("白話");
  });

  it("TEST 5 — malformed critical output still rejected; soft meta does not kill reply", () => {
    expect(parseCoachingAiV2Generation({ coach_message: "", meta: validMeta() }).ok).toBe(false);
    // Invalid lifecycle / memory category are noncritical — reply preserved when message valid
    const soft = parseCoachingAiV2Generation(
      {
        coach_message: "ok",
        meta: validMeta({
          lifecycle_stage: "not_a_real_stage",
          memory_writes: [{ category: "not_a_category", content: "x" }],
        }),
      },
      { lifecycleDay: 2, lifecycleStage: "understand" },
    );
    expect(soft.ok).toBe(true);
    if (soft.ok) {
      expect(soft.data.meta.lifecycleStage).toBe("understand");
      expect(soft.data.meta.memoryWrites).toHaveLength(0);
    }
  });

  it("does not emit schema_invalid for unknown safe move", () => {
    const parsed = parseCoachingAiV2Generation({
      coach_message: "明天想吃大餐可以呀。",
      meta: validMeta({ intention: "hold_space" }),
    });
    expect(parsed.ok).toBe(true);
  });

  it("OpenAI provider schema no longer hard-enums intention", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/coaching/ai/v2/v2-output-schema.ts"),
      "utf8",
    );
    expect(src).toContain('intention: { type: "string", minLength: 1, maxLength: 80 }');
    expect(src).not.toMatch(/intention:\s*\{\s*type:\s*"string",\s*enum:/);
  });
});

describe("Go21 schema move compatibility — fixtures + durability contracts", () => {
  it("fixture drafts still use canonical intentions", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGenerationInput(),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(2),
      channel: "free_message",
      freeMessage: "明天想吃大餐",
    });
    expect(COACHING_AI_V2_INTENTIONS).toContain(draft.meta.intention);
  });

  it("TEST 9 — Goal still reaches generation context", () => {
    const snapshot = buildGo21GoalSnapshot({
      primaryDirection: "fat_loss_body",
      personalGoal: "晚餐少一點",
      targetWeightKg: 60,
      source: "onboarding",
    });
    const record = parseGo21GoalRecord({
      version: 1,
      current: snapshot,
      history: [],
    });
    const ctx = buildGo21CoachGenerationContext({ goalRecord: record });
    expect(ctx.goalReachedGenerationContext).toBe(true);
  });

  it("TEST 7/8/12 — chat route still accepts customer before generation + retry", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/coaching/portal/[token]/go21/chat/route.ts"),
      "utf8",
    );
    expect(src).toContain("acceptGo21CustomerTurn");
    expect(src).toContain("customerAlreadyAccepted: true");
    expect(src).toContain('assistantStatus: "failed"');
  });

  it("V3 prompt wording unchanged by this hotfix", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(sys).toContain("先理解");
    expect(sys).toContain("有用才介入");
    expect(sys).toContain("確認／觀察／好奇／教練／鼓勵／澄清／糾正");
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
    enrollmentId: "enr-schema",
    customerId: "cus-schema",
    profileMemory: {
      displayName: "測試",
      goal: "改善飲食",
      daysSinceEnrollmentStart: 3,
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
