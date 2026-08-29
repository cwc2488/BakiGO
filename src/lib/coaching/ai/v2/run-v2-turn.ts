import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingPlanSnapshot } from "@/types/coaching";
import type {
  CoachingAiV2GenerationDraft,
  CoachingAiV2Observability,
  CoachingAiV2TurnChannel,
} from "@/types/coaching-ai-v2";
import {
  CoachingAiV2MemoryStore,
  getSharedInMemoryV2Store,
} from "@/lib/coaching/ai/v2/memory-store";
import { generateCoachingAiV2, logCoachingAiV2Observability } from "@/lib/coaching/ai/v2/generate-v2";
import { bridgeV2DraftToDailyOutput } from "@/lib/coaching/ai/v2/v2-bridge";
import {
  hydrateV2StoreFromSupabase,
  persistV2MemoryFromSupabaseIfConfigured,
  type PersistV2MemoryResult,
} from "@/lib/coaching/ai/v2/v2-supabase-store";
import { enrichTurnContentForAi } from "@/lib/go21/conversation-quality";

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
  /** Model-facing message (may include vision/system hints). */
  freeMessage?: string | null;
  /** Customer-facing persisted text — never vision system blobs. */
  customerDisplayContent?: string | null;
  customerChannel?: CoachingAiV2TurnChannel;
  customerMetadata?: Record<string, unknown>;
  clientRequestId?: string | null;
  ownerMemberId?: string;
  store?: CoachingAiV2MemoryStore;
  /** When true, also attempt Supabase persistence (service role). */
  persistToSupabase?: boolean;
  /** Hydrate durable turns/memory into the process store before generate. */
  hydrateFromSupabase?: boolean;
  go21Goal?: {
    primaryDirection: string;
    primaryDirectionLabel: string;
    personalGoal: string;
    targetWeightKg: number | null;
    originalPersonalGoal: string | null;
    wasRefined: boolean;
    guidance: string;
  } | null;
  recentVisionObservations?: Array<{
    summary: string;
    correction: string | null;
  }> | null;
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
  persistResult: PersistV2MemoryResult | null;
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
  const ownerMemberId = input.ownerMemberId ?? "";

  if (input.hydrateFromSupabase ?? input.persistToSupabase) {
    await hydrateV2StoreFromSupabase({
      store,
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId,
      logDate,
    });
  }

  const cycle = await store.ensureActiveCycle({
    enrollmentId: input.generationInput.enrollmentId,
    customerId: input.generationInput.customerId,
    ownerMemberId,
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
      ownerMemberId,
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

  const displayContent =
    input.customerDisplayContent?.trim() ||
    input.freeMessage?.trim() ||
    summarizeCustomerDailyInput(input.generationInput) ||
    "（今日回報）";

  const visionSummary =
    typeof input.customerMetadata?.visionEvidenceSummary === "string"
      ? input.customerMetadata.visionEvidenceSummary
      : null;
  const correction =
    typeof input.customerMetadata?.customerCorrection === "string"
      ? input.customerMetadata.customerCorrection
      : null;

  // In-memory turn for generation uses AI-enriched content; Supabase stores display content.
  await store.appendTurn({
    enrollmentId: input.generationInput.enrollmentId,
    customerId: input.generationInput.customerId,
    ownerMemberId,
    cycleId: effectiveCycle?.id ?? memory.lifecycle.cycle?.id ?? null,
    logDate,
    role: "customer",
    channel:
      input.customerChannel ??
      (channel === "free_message" ? "free_message" : channel === "day21" ? "day21" : "daily_log"),
    content: enrichTurnContentForAi({
      displayContent,
      visionEvidenceSummary: visionSummary,
      customerCorrection: correction,
    }),
    contentSummary: visionSummary?.slice(0, 400) ?? null,
    metadata: input.customerMetadata ?? {},
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
    go21Goal: input.go21Goal,
    recentVisionObservations: input.recentVisionObservations,
  });

  let memoryUpdateOutcome: CoachingAiV2Observability["memoryUpdateOutcome"] = "applied";
  try {
    const cycleId = memoryAfterCustomer.lifecycle.cycle?.id ?? effectiveCycle?.id ?? null;
    await store.applyMemoryWrites({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId,
      cycleId,
      logDate,
      writes: generated.draft.meta.memoryWrites,
    });
    await store.applyOpenLoopOps({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId,
      cycleId,
      logDate,
      ops: generated.draft.meta.openLoopOps,
    });
    await store.applyHypothesisOps({
      enrollmentId: input.generationInput.enrollmentId,
      customerId: input.generationInput.customerId,
      ownerMemberId,
      cycleId,
      ops: generated.draft.meta.hypothesisOps,
    });

    if (generated.draft.meta.day21Reflection && cycleId) {
      await store.saveDay21Reflection({
        enrollmentId: input.generationInput.enrollmentId,
        customerId: input.generationInput.customerId,
        ownerMemberId,
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
      ownerMemberId,
      cycleId,
      logDate,
      role: "coach",
      channel: channel === "day21" ? "day21" : channel === "free_message" ? "free_message" : "daily_log",
      content: generated.draft.coachMessage,
      intention: generated.draft.meta.intention,
      metadata: {
        safetyTriggered: generated.draft.meta.safetyTriggered,
        escalationSuggested: generated.draft.meta.escalationSuggested,
        ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      },
    });
  } catch {
    memoryUpdateOutcome = "failed";
  }

  let persistResult: PersistV2MemoryResult | null = null;
  if (input.persistToSupabase) {
    try {
      persistResult = await persistV2MemoryFromSupabaseIfConfigured({
        enrollmentId: input.generationInput.enrollmentId,
        customerId: input.generationInput.customerId,
        ownerMemberId: ownerMemberId || undefined,
        draft: generated.draft,
        logDate,
        coachMessage: generated.draft.coachMessage,
        channel,
        model: generated.model,
        promptVersion: generated.promptVersion,
        enrollmentStartedAt: input.enrollmentStartedAt,
        plannedEndAt: input.plannedEndAt,
        planSnapshot: input.planSnapshot ?? input.generationInput.profileMemory.planSnapshot,
        customerDisplayContent: displayContent,
        customerChannel:
          input.customerChannel ??
          (channel === "free_message" ? "free_message" : channel === "day21" ? "day21" : "daily_log"),
        customerMetadata: input.customerMetadata,
        clientRequestId: input.clientRequestId,
      });
      if (!persistResult.ok) memoryUpdateOutcome = "failed";
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
    persistResult,
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
