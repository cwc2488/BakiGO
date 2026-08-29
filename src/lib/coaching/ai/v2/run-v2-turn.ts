import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingPlanSnapshot } from "@/types/coaching";
import type {
  CoachingAiV2GenerationDraft,
  CoachingAiV2Observability,
} from "@/types/coaching-ai-v2";
import {
  CoachingAiV2MemoryStore,
  getSharedInMemoryV2Store,
} from "@/lib/coaching/ai/v2/memory-store";
import { generateCoachingAiV2, logCoachingAiV2Observability } from "@/lib/coaching/ai/v2/generate-v2";
import { bridgeV2DraftToDailyOutput } from "@/lib/coaching/ai/v2/v2-bridge";
import { persistV2MemoryFromSupabaseIfConfigured } from "@/lib/coaching/ai/v2/v2-supabase-store";

export function isCoachingAiV2Enabled(): boolean {
  const flag = process.env.COACHING_AI_V2_ENABLED?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  // Default ON for feat/ai-coach-v2 branch builds; Production must set OFF until accepted.
  return true;
}

export type RunCoachingAiV2TurnInput = {
  generationInput: CoachingGenerationInput;
  decisionContext: CoachingDecisionContext;
  enrollmentStartedAt?: string | null;
  plannedEndAt?: string | null;
  planSnapshot?: CoachingPlanSnapshot | null;
  channel?: "daily_log" | "free_message" | "day21";
  freeMessage?: string | null;
  store?: CoachingAiV2MemoryStore;
  /** When true, also attempt Supabase persistence (service role). */
  persistToSupabase?: boolean;
};

export type RunCoachingAiV2TurnResult = {
  outputJson: ReturnType<typeof bridgeV2DraftToDailyOutput>;
  draft: CoachingAiV2GenerationDraft;
  observability: CoachingAiV2Observability;
  model: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    imageCount: number;
  };
  latencyMs: number;
};

/**
 * Full V2 turn: ensure cycle → load memory → generate → apply memory ops → bridge.
 */
export async function runCoachingAiV2Turn(
  input: RunCoachingAiV2TurnInput,
): Promise<RunCoachingAiV2TurnResult> {
  const store = input.store ?? getSharedInMemoryV2Store();
  const channel = input.channel ?? "daily_log";
  const logDate = input.generationInput.logDate;

  const cycle = await store.ensureActiveCycle({
    enrollmentId: input.generationInput.enrollmentId,
    customerId: input.generationInput.customerId,
    ownerMemberId: "", // filled below if we can; in-memory tolerates empty for tests
    enrollmentStartedAt:
      input.enrollmentStartedAt ??
      // Approximate from daysSinceEnrollmentStart when caller omits startedAt
      null,
    plannedEndAt: input.plannedEndAt,
    planSnapshot: input.planSnapshot ?? input.generationInput.profileMemory.planSnapshot,
  });

  // If cycle missing because startedAt unknown, synthesize from profile days.
  let effectiveCycle = cycle;
  if (!effectiveCycle) {
    const days = input.generationInput.profileMemory.daysSinceEnrollmentStart;
    const start = shiftIsoDate(logDate, -Math.max(0, days));
    effectiveCycle = await store.ensureActiveCycle({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId: "",
      enrollmentStartedAt: start,
      plannedEndAt: input.plannedEndAt,
      planSnapshot: input.planSnapshot ?? input.generationInput.profileMemory.planSnapshot,
    });
  }

  await store.staleOpenLoops(input.generationInput.enrollmentId, logDate);

  const memory = await store.loadMemoryBundle({
    enrollmentId: input.generationInput.enrollmentId,
    logDate,
  });

  // Customer turn content
  const customerContent =
    input.freeMessage?.trim() ||
    summarizeCustomerDailyInput(input.generationInput) ||
    "（今日回報）";

  await store.appendTurn({
    enrollmentId: input.generationInput.enrollmentId,
    customerId: input.generationInput.customerId,
    ownerMemberId: "",
    cycleId: effectiveCycle?.id ?? memory.lifecycle.cycle?.id ?? null,
    logDate,
    role: "customer",
    channel: channel === "free_message" ? "free_message" : channel === "day21" ? "day21" : "daily_log",
    content: customerContent,
  });

  // Refresh memory after customer turn
  const memoryAfterCustomer = await store.loadMemoryBundle({
    enrollmentId: input.generationInput.enrollmentId,
    logDate,
  });

  const generated = await generateCoachingAiV2({
    generationInput: input.generationInput,
    decisionContext: input.decisionContext,
    finalInterventionLevel: input.decisionContext.finalInterventionLevel,
    memory: memoryAfterCustomer,
    channel,
    freeMessage: input.freeMessage,
  });

  let memoryUpdateOutcome: CoachingAiV2Observability["memoryUpdateOutcome"] = "applied";
  try {
    const cycleId = memoryAfterCustomer.lifecycle.cycle?.id ?? effectiveCycle?.id ?? null;
    await store.applyMemoryWrites({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId: "",
      cycleId,
      logDate,
      writes: generated.draft.meta.memoryWrites,
    });
    await store.applyOpenLoopOps({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId: "",
      cycleId,
      logDate,
      ops: generated.draft.meta.openLoopOps,
    });
    await store.applyHypothesisOps({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId: "",
      cycleId,
      ops: generated.draft.meta.hypothesisOps,
    });

    if (generated.draft.meta.day21Reflection && cycleId) {
      await store.saveDay21Reflection({
        enrollmentId: input.generationInput.enrollmentId,
        customerId: input.generationInput.customerId,
        ownerMemberId: "",
        cycleId,
        reflectionJson: generated.draft.meta.day21Reflection,
        customerMessage: generated.draft.coachMessage,
        coachSummary: generated.draft.meta.day21Reflection.nextActions.join("；"),
        model: generated.model,
        promptVersion: generated.promptVersion,
      });
    }

    await store.appendTurn({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId: "",
      cycleId,
      logDate,
      role: "coach",
      channel: channel === "day21" ? "day21" : "daily_log",
      content: generated.draft.coachMessage,
      intention: generated.draft.meta.intention,
      metadata: {
        safetyTriggered: generated.draft.meta.safetyTriggered,
        escalationSuggested: generated.draft.meta.escalationSuggested,
      },
    });
  } catch {
    memoryUpdateOutcome = "failed";
  }

  if (input.persistToSupabase) {
    try {
      await persistV2MemoryFromSupabaseIfConfigured({
        enrollmentId: input.generationInput.enrollmentId,
        customerId: input.generationInput.customerId,
        // owner filled inside helper when possible
        draft: generated.draft,
        logDate,
        coachMessage: generated.draft.coachMessage,
        channel,
        model: generated.model,
        promptVersion: generated.promptVersion,
        enrollmentStartedAt: input.enrollmentStartedAt,
        plannedEndAt: input.plannedEndAt,
        planSnapshot: input.planSnapshot ?? input.generationInput.profileMemory.planSnapshot,
      });
    } catch (error) {
      console.error("[coaching_ai_v2] supabase persist failed", error);
      memoryUpdateOutcome = "failed";
    }
  }

  const observability: CoachingAiV2Observability = {
    ...generated.observability,
    memoryUpdateOutcome,
  };
  logCoachingAiV2Observability({
    ...observability,
    enrollmentId: input.generationInput.enrollmentId,
    logDate,
  });

  const outputJson = bridgeV2DraftToDailyOutput({
    draft: generated.draft,
    decisionContext: input.decisionContext,
    finalInterventionLevel: input.decisionContext.finalInterventionLevel,
  });

  return {
    outputJson,
    draft: generated.draft,
    observability,
    model: generated.model,
    promptVersion: generated.promptVersion,
    usage: generated.usage,
    latencyMs: generated.latencyMs,
  };
}

function summarizeCustomerDailyInput(generationInput: CoachingGenerationInput): string {
  const parts: string[] = [];
  for (const meal of generationInput.todayContext.primaryMeals) {
    if (meal.textNote?.trim()) {
      parts.push(`${meal.mealSlot}: ${meal.textNote.trim()}`);
    } else if (meal.storagePath) {
      parts.push(`${meal.mealSlot}: [photo]`);
    }
  }
  if (generationInput.todayContext.customerNote?.trim()) {
    parts.push(`note: ${generationInput.todayContext.customerNote.trim()}`);
  }
  if (generationInput.todayContext.waterMl != null) {
    parts.push(`water: ${generationInput.todayContext.waterMl}ml`);
  }
  return parts.join(" / ").slice(0, 800);
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
  const yy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
