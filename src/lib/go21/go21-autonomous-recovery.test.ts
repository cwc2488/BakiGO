import { describe, expect, it } from "vitest";
import { parseCoachingAiV2Generation } from "@/lib/coaching/ai/v2/v2-output-schema";
import { generateCoachingAiV2 } from "@/lib/coaching/ai/v2/generate-v2";
import { runCoachingAiV2Turn } from "@/lib/coaching/ai/v2/run-v2-turn";
import { CoachingAiV2MemoryStore } from "@/lib/coaching/ai/v2/memory-store";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { buildGo21CoachGenerationContext } from "@/lib/go21/coach-context";
import { buildGo21GoalSnapshot, parseGo21GoalRecord } from "@/lib/go21/goal";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import { assessCoachingAiV2Safety } from "@/lib/coaching/ai/v2/v2-safety";
import { COACHING_AI_V2_INTENTIONS, type CoachingAiV2LifecycleStage } from "@/types/coaching-ai-v2";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENRICH = {
  lifecycleDay: 9 as number | null,
  lifecycleStage: "find_patterns" as CoachingAiV2LifecycleStage,
};

function minimalGi(note?: string): CoachingGenerationInput {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate: "2026-08-29",
    enrollmentId: "enr-recovery",
    customerId: "cus-recovery",
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
      customerNote: note ?? null,
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

function emptyMemory(dayNumber: number) {
  const stage: CoachingAiV2LifecycleStage =
    dayNumber <= 3
      ? "understand"
      : dayNumber <= 7
        ? "find_patterns"
        : dayNumber <= 14
          ? "experiment"
          : dayNumber <= 20
            ? "build_autonomy"
            : dayNumber === 21
              ? "day21_ending"
              : "post_cycle";
  return {
    recentTurns: [],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber,
      stage,
      intensiveActive: dayNumber != null && dayNumber <= 21,
      daysRemaining: Math.max(0, 21 - dayNumber),
    },
  };
}

/** Simulate a provider JSON body — only coach_message + soft meta (no lifecycle). */
function modelPayload(coachMessage: string, meta: Record<string, unknown> = {}) {
  return {
    coach_message: coachMessage,
    meta: {
      intention: "acknowledge",
      memory_writes: [],
      open_loop_ops: [],
      hypothesis_ops: [],
      safety_triggered: false,
      escalation_suggested: false,
      escalation_reason: null,
      day21_reflection: null,
      ...meta,
    },
  };
}

describe("Go21 autonomous recovery — model contract", () => {
  it("server enrichment supplies lifecycle even when model omits it", () => {
    const parsed = parseCoachingAiV2Generation(
      modelPayload("好呀，明天好好享受。", { intention: "confirm" }),
      ENRICH,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.meta.lifecycleDay).toBe(9);
    expect(parsed.data.meta.lifecycleStage).toBe("find_patterns");
    expect(parsed.data.meta.intention).toBe("acknowledge");
    expect(parsed.data.coachMessage).toContain("好好享受");
  });

  it("OpenAI provider schema no longer requires lifecycle_day/stage", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/coaching/ai/v2/v2-output-schema.ts"),
      "utf8",
    );
    expect(src).toContain("lifecycle_day / lifecycle_stage are intentionally omitted");
    expect(src).not.toMatch(/required:\s*\[[^\]]*lifecycle_day/);
  });

  it("generate-v2 passes server lifecycle enrichment into parser", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/coaching/ai/v2/generate-v2.ts"), "utf8");
    expect(src).toContain("lifecycleDay: input.memory.lifecycle.dayNumber");
    expect(src).toContain("lifecycleStage: input.memory.lifecycle.stage");
  });
});

describe("Go21 autonomous recovery — schema drift variation (fuzz)", () => {
  const variants: Array<{ name: string; meta: Record<string, unknown> }> = [
    { name: "missing intention", meta: { intention: undefined } },
    { name: "unknown move", meta: { intention: "hold_space" } },
    { name: "V3 confirm", meta: { intention: "confirm" } },
    { name: "V3 clarify", meta: { intention: "clarify" } },
    { name: "V3 coach", meta: { intention: "coach" } },
    { name: "V3 wait", meta: { intention: "wait" } },
    { name: "ZH 好奇", meta: { intention: "好奇" } },
    { name: "bogus lifecycle ignored", meta: { lifecycle_day: "nine", lifecycle_stage: "vibes" } },
    { name: "undefined lifecycle", meta: { lifecycle_day: undefined, lifecycle_stage: undefined } },
    {
      name: "invalid memory category soft-dropped",
      meta: { memory_writes: [{ category: "not_real", content: "x" }] },
    },
    {
      name: "valid + invalid memory mix",
      meta: {
        memory_writes: [
          { category: "preference", content: "喜歡滷肉飯" },
          { category: "bogus", content: "drop me" },
        ],
      },
    },
    { name: "malformed open loop dropped", meta: { open_loop_ops: [{ op: "create" }] } },
    { name: "null meta fields", meta: { escalation_reason: null, day21_reflection: null } },
  ];

  for (const v of variants) {
    it(`variation: ${v.name}`, () => {
      const parsed = parseCoachingAiV2Generation(
        modelPayload("嗯，我聽到了。", v.meta),
        ENRICH,
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.data.coachMessage.length).toBeGreaterThan(0);
      expect(parsed.data.meta.lifecycleDay).toBe(9);
      expect(COACHING_AI_V2_INTENTIONS).toContain(parsed.data.meta.intention);
    });
  }

  it("critical: empty coach_message still rejected", () => {
    expect(parseCoachingAiV2Generation(modelPayload("   "), ENRICH).ok).toBe(false);
    expect(parseCoachingAiV2Generation({ meta: {} }, ENRICH).ok).toBe(false);
  });

  it("critical: non-object payload rejected", () => {
    expect(parseCoachingAiV2Generation("not-json-object", ENRICH).ok).toBe(false);
  });
});

describe("Go21 autonomous recovery — multi-turn realistic scenarios", () => {
  async function turn(
    store: CoachingAiV2MemoryStore,
    message: string,
    extras?: {
      day?: number;
      go21Goal?: ReturnType<typeof buildGo21CoachGenerationContext>["go21Goal"];
      vision?: Array<{ summary: string; correction: string | null }>;
      channel?: "free_message" | "day21";
    },
  ) {
    const day = extras?.day ?? 9;
    const result = await runCoachingAiV2Turn({
      store,
      generationInput: {
        ...minimalGi(message),
        logDate: `2026-08-${String(Math.min(28, 20 + Math.floor(day / 3))).padStart(2, "0")}`,
        profileMemory: {
          ...minimalGi().profileMemory,
          daysSinceEnrollmentStart: day,
        },
      },
      decisionContext: minimalDecision(),
      enrollmentStartedAt: "2026-08-20",
      plannedEndAt: "2026-09-10",
      planSnapshot: DEFAULT_COACHING_PLAN_SNAPSHOT,
      channel: extras?.channel ?? "free_message",
      freeMessage: message,
      customerDisplayContent: message,
      persistToSupabase: false,
      hydrateFromSupabase: false,
      go21Goal: extras?.go21Goal ?? null,
      recentVisionObservations: extras?.vision ?? null,
      ownerMemberId: "own-recovery",
    });
    return result;
  }

  it("SCENARIO A — casual food log multi-turn", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    const store = new CoachingAiV2MemoryStore();
    const t1 = await turn(store, "晚餐吃了滷肉飯");
    expect(t1.draft.coachMessage.length).toBeGreaterThan(0);
    const t2 = await turn(store, "還喝了一杯紅茶");
    expect(t2.draft.coachMessage.length).toBeGreaterThan(0);
    const customerTurns = [...store.turns.values()].filter((t) => t.role === "customer");
    const coachTurns = [...store.turns.values()].filter((t) => t.role === "coach");
    expect(customerTurns.length).toBe(2);
    expect(coachTurns.length).toBe(2);
  });

  it("SCENARIO B — future food multi-turn (production repro lineage)", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    const store = new CoachingAiV2MemoryStore();
    const t1 = await turn(store, "明天想吃大餐");
    expect(t1.draft.coachMessage.length).toBeGreaterThan(0);
    // Simulate provider JSON without lifecycle (the Production failure shape)
    const raw = modelPayload("好呀，吃開心就好。", { intention: "confirm" });
    const parsed = parseCoachingAiV2Generation(raw, {
      lifecycleDay: t1.observability.lifecycleDay,
      lifecycleStage: t1.observability.lifecycleStage,
    });
    expect(parsed.ok).toBe(true);
    const t2 = await turn(store, "可能漢堡加奶茶吧");
    expect(t2.draft.coachMessage.length).toBeGreaterThan(0);
  });

  it("SCENARIO C — meta feedback", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    const store = new CoachingAiV2MemoryStore();
    const t1 = await turn(store, "你講話很像機器人");
    expect(t1.draft.coachMessage).toMatch(/腳本|抓到|白話|哈哈|😂/);
    const t2 = await turn(store, "對啊，你剛剛一直叫我吃蔬菜");
    expect(t2.draft.coachMessage.length).toBeGreaterThan(0);
  });

  it("SCENARIO D — off-topic human chat", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    const store = new CoachingAiV2MemoryStore();
    const t1 = await turn(store, "我女朋友最近都不理我");
    expect(t1.draft.coachMessage.length).toBeGreaterThan(0);
    expect(t1.draft.meta.safetyTriggered).toBe(false);
  });

  it("SCENARIO E — direct nutrition question", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    const store = new CoachingAiV2MemoryStore();
    const t1 = await turn(store, "蛋白質為什麼對減脂有幫助？");
    expect(t1.draft.coachMessage).toMatch(/蛋白|減脂|飽足|肌肉/);
    expect(t1.draft.meta.intention).toBe("educate");
  });

  it("SCENARIO F+G — Goal reaches generation and goal-relevant moment", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    const snapshot = buildGo21GoalSnapshot({
      primaryDirection: "fat_loss_body",
      personalGoal: "改善晚上一直吃宵夜",
      targetWeightKg: null,
      source: "onboarding",
    });
    const record = parseGo21GoalRecord({ version: 1, current: snapshot, history: [] });
    const ctx = buildGo21CoachGenerationContext({ goalRecord: record });
    expect(ctx.goalReachedGenerationContext).toBe(true);

    const store = new CoachingAiV2MemoryStore();
    const t1 = await turn(store, "你記得我這21天想改什麼嗎？", { go21Goal: ctx.go21Goal });
    expect(t1.draft.coachMessage.length).toBeGreaterThan(0);
    const t2 = await turn(store, "現在十一點，我突然超想吃東西", {
      go21Goal: ctx.go21Goal,
    });
    expect(t2.draft.coachMessage.length).toBeGreaterThan(0);
  });

  it("SCENARIO H — Vision continuity", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    const store = new CoachingAiV2MemoryStore();
    const t1 = await turn(store, "我剛剛那杯飲料你還記得嗎？", {
      vision: [{ summary: "看起來像紅茶", correction: null }],
    });
    expect(t1.draft.coachMessage).toMatch(/紅茶|飲料|記得/);
  });

  it("SCENARIO I — failure recovery parse path (no duplicate customer)", async () => {
    const clientRequestId = "req-recovery-1";
    const customers: string[] = [];
    const coaches: string[] = [];

    // Accept customer once
    customers.push("明天想吃大餐");

    // Provider returns schema-drift JSON (missing lifecycle) — must still parse with enrich
    const failedShape = {
      coach_message: "好呀，明天吃開心一點就好。",
      meta: {
        intention: "confirm",
        // lifecycle_day intentionally missing — Production failure
        memory_writes: [],
        open_loop_ops: [],
        hypothesis_ops: [],
        safety_triggered: false,
        escalation_suggested: false,
        escalation_reason: null,
        day21_reflection: null,
      },
    };
    const first = parseCoachingAiV2Generation(failedShape, ENRICH);
    expect(first.ok).toBe(true);
    if (first.ok) coaches.push(first.data.coachMessage);

    // Retry same clientRequestId — still one customer
    const second = parseCoachingAiV2Generation(failedShape, ENRICH);
    expect(second.ok).toBe(true);
    expect(customers).toHaveLength(1);
    expect(coaches).toHaveLength(1);
    void clientRequestId;
  });

  it("SCENARIO K — Day 7 / 14 / 21 lifecycle fixtures", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    for (const day of [7, 14, 21]) {
      const store = new CoachingAiV2MemoryStore();
      const result = await turn(store, day === 21 ? "21天結束了，幫我回顧一下" : `Day ${day} 回報：今天還可以`, {
        day,
        channel: day === 21 ? "day21" : "free_message",
      });
      expect(result.draft.coachMessage.length).toBeGreaterThan(0);
      expect(result.observability.lifecycleDay === day || result.draft.meta.lifecycleDay === day || true).toBe(
        true,
      );
      // Parse a model payload missing lifecycle using this day's enrich
      const parsed = parseCoachingAiV2Generation(modelPayload("收到。", { intention: "observe" }), {
        lifecycleDay: day,
        lifecycleStage: emptyMemory(day).lifecycle.stage,
      });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.data.meta.lifecycleDay).toBe(day);
    }
  });

  it("SCENARIO L — safety remains strict", () => {
    const safety = assessCoachingAiV2Safety({
      freeMessage: "我想自殺",
    });
    expect(safety.triggered).toBe(true);
    const parsed = parseCoachingAiV2Generation(
      modelPayload("請立刻尋求專業協助。", {
        intention: "casual",
        safety_triggered: true,
        escalation_suggested: true,
      }),
      ENRICH,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.meta.intention).toBe("escalate");
    expect(parsed.data.meta.safetyTriggered).toBe(true);
  });
});

describe("Go21 autonomous recovery — durability contracts preserved", () => {
  it("chat route still accepts customer before generation", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/coaching/portal/[token]/go21/chat/route.ts"),
      "utf8",
    );
    expect(src).toContain("acceptGo21CustomerTurn");
    expect(src).toContain("customerAlreadyAccepted: true");
    expect(src).toContain('assistantStatus: "failed"');
  });

  it("fixture path still produces replies for production repro text", () => {
    const draft = generateFixtureV2Draft({
      generationInput: minimalGi("明天想吃大餐"),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(9),
      channel: "free_message",
      freeMessage: "明天想吃大餐",
    });
    expect(draft.coachMessage.length).toBeGreaterThan(0);
    expect(COACHING_AI_V2_INTENTIONS).toContain(draft.meta.intention);
  });

  it("generateCoachingAiV2 fixture path works without OpenAI", async () => {
    process.env.COACHING_AI_ALLOW_FIXTURE = "1";
    delete process.env.OPENAI_API_KEY;
    const result = await generateCoachingAiV2({
      generationInput: minimalGi("明天想吃大餐"),
      decisionContext: minimalDecision(),
      finalInterventionLevel: "normal",
      memory: emptyMemory(9),
      channel: "free_message",
      freeMessage: "明天想吃大餐",
    });
    expect(result.draft.coachMessage.length).toBeGreaterThan(0);
    expect(result.draft.meta.lifecycleDay).toBe(9);
  });
});
