import type { CoachingGenerationInput, CoachingInterventionLevel } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type {
  CoachingAiV2GenerationDraft,
  CoachingAiV2MemoryBundle,
  CoachingAiV2Observability,
} from "@/types/coaching-ai-v2";
import type { Go21LongitudinalUnderstandingForAi } from "@/types/go21";
import {
  COACHING_AI_V2_PROMPT_VERSION,
  COACHING_AI_V2_POINT_KEY,
} from "@/types/coaching-ai-v2";
import { getCoachingDailyAiModelId, COACHING_DAILY_AI_TIMEOUT_MS } from "@/lib/coaching/ai/model-config";
import { parseOpenAiChatCompletionUsage } from "@/lib/coaching/ai/parse-openai-usage";
import {
  buildCoachingAiV2SystemPrompt,
  buildCoachingAiV2UserPrompt,
} from "@/lib/coaching/ai/v2/v2-prompts";
import {
  coachingAiV2OpenAiJsonSchema,
  parseCoachingAiV2Generation,
} from "@/lib/coaching/ai/v2/v2-output-schema";
import { assessCoachingAiV2Safety } from "@/lib/coaching/ai/v2/v2-safety";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { canUseFixtureCoachingAiProvider } from "@/lib/coaching/ai/coaching-ai-provider";
import {
  composeGo21NaturalConversationalReply,
  conversationalMovePrefersNaturalAck,
  detectGo21ConversationalMove,
} from "@/lib/go21/conversational-move";

export type GenerateCoachingAiV2Input = {
  generationInput: CoachingGenerationInput;
  decisionContext: CoachingDecisionContext;
  finalInterventionLevel: CoachingInterventionLevel;
  memory: CoachingAiV2MemoryBundle;
  channel?: "daily_log" | "free_message" | "day21";
  freeMessage?: string | null;
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
  longitudinalUnderstanding?: Go21LongitudinalUnderstandingForAi | null;
  /** Soft daily targets + approx today state — judgment aid, not a report to narrate. */
  dailyTargetsState?: {
    logDate: string;
    targets: {
      waterMl: number | null;
      caloriesKcal: number | null;
      proteinG: number | null;
      sleepHours: number | null;
    } | null;
    approxToday: {
      waterMl: number | null;
      waterConfidence: string;
      caloriesKcal: number | null;
      caloriesRange: [number, number] | null;
      caloriesConfidence: string;
      proteinG: number | null;
      proteinRange: [number, number] | null;
      proteinConfidence: string;
      sleepHours: number | null;
      sleepConfidence: string;
      sleepNote: string | null;
    };
    softCues: string[];
    guidance: string;
  } | null;
  coachDailyPlan?: {
    items: Array<{
      id: string;
      period: string;
      periodLabel: string;
      name: string;
      amount: string | null;
      instruction: string | null;
    }>;
    today: Array<{
      itemId: string;
      status: string;
      evidence: string | null;
      confidence: string;
    }>;
    guidance: string;
  } | null;
  visionNonFood?: boolean | null;
  currentTurnEvidence?: {
    kind: string;
    hasPhoto: boolean;
    foodRelevant: boolean | null;
    imageDescription: string | null;
    visionSummary: string | null;
    confidence: string | null;
    guidance: string;
  } | null;
};

export type GenerateCoachingAiV2Result = {
  draft: CoachingAiV2GenerationDraft;
  model: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    imageCount: number;
  };
  latencyMs: number;
  observability: CoachingAiV2Observability;
  usedFixture: boolean;
};

export async function generateCoachingAiV2(
  input: GenerateCoachingAiV2Input,
): Promise<GenerateCoachingAiV2Result> {
  const channel = input.channel ?? "daily_log";
  const safety = assessCoachingAiV2Safety({
    customerNote: input.generationInput.todayContext.customerNote,
    freeMessage: input.freeMessage,
    mealNotes: input.generationInput.todayContext.primaryMeals
      .map((m) => m.textNote)
      .filter((v): v is string => Boolean(v)),
  });

  if (safety.triggered && safety.safeReply) {
    const draft: CoachingAiV2GenerationDraft = {
      coachMessage: safety.safeReply,
      meta: {
        intention: "detect_risk",
        lifecycleDay: input.memory.lifecycle.dayNumber,
        lifecycleStage: input.memory.lifecycle.stage,
        memoryWrites: [],
        openLoopOps: [],
        hypothesisOps: [],
        safetyTriggered: true,
        escalationSuggested: safety.escalate,
        escalationReason: safety.reasons.join(",") || "safety",
        day21Reflection: null,
      },
    };
    return {
      draft,
      model: "safety_boundary",
      promptVersion: COACHING_AI_V2_PROMPT_VERSION,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, imageCount: 0 },
      latencyMs: 0,
      usedFixture: true,
      observability: baseObservability({
        model: "safety_boundary",
        memory: input.memory,
        draft,
      }),
    };
  }

  // Deterministic short-circuit for high-confidence social moves BEFORE OpenAI.
  // Production regression: meta_ai_tease / humor_social depended on provider and
  // failed with HTTP 200 + assistantStatus failed. Fixture already short-circuited;
  // live path must match for reliability.
  const conversationalMove = detectGo21ConversationalMove({
    freeMessage: input.freeMessage,
    recentTurns: input.memory.recentTurns.map((t) => ({ role: t.role, content: t.content })),
  });
  if (
    conversationalMove &&
    conversationalMovePrefersNaturalAck(conversationalMove.move) &&
    (conversationalMove.move === "meta_ai_tease" ||
      conversationalMove.move === "humor_social" ||
      conversationalMove.move === "acknowledgement" ||
      conversationalMove.move === "confirmation" ||
      conversationalMove.move === "rejection")
  ) {
    const todayHeavyFoods = listHeavyFromDecision(input.decisionContext);
    const draft: CoachingAiV2GenerationDraft = {
      coachMessage: composeGo21NaturalConversationalReply(conversationalMove, {
        todayHeavyFoods,
        alreadyHeavyToday: todayHeavyFoods.length > 0,
      }),
      meta: {
        intention: "casual",
        lifecycleDay: input.memory.lifecycle.dayNumber,
        lifecycleStage: input.memory.lifecycle.stage,
        memoryWrites: [],
        openLoopOps: [],
        hypothesisOps: [],
        safetyTriggered: false,
        escalationSuggested: false,
        escalationReason: null,
        day21Reflection: null,
      },
    };
    return {
      draft,
      model: "deterministic_conversational",
      promptVersion: COACHING_AI_V2_PROMPT_VERSION,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, imageCount: 0 },
      latencyMs: 0,
      usedFixture: true,
      observability: baseObservability({
        model: "deterministic_conversational",
        memory: input.memory,
        draft,
      }),
    };
  }

  // Non-food image with empty/minimal text — reliable social ack without OpenAI
  if (
    input.visionNonFood &&
    input.currentTurnEvidence?.kind === "image_non_food" &&
    !(input.freeMessage ?? "").replace(/（傳了一張照片）|\[影像觀察[\s\S]*/g, "").trim()
  ) {
    const hint = input.currentTurnEvidence.imageDescription;
    const draft: CoachingAiV2GenerationDraft = {
      coachMessage: hint && /貓/.test(hint) ? "這個不能吃啦 😂" : "這張看起來不是餐點欸 😂",
      meta: {
        intention: "casual",
        lifecycleDay: input.memory.lifecycle.dayNumber,
        lifecycleStage: input.memory.lifecycle.stage,
        memoryWrites: [],
        openLoopOps: [],
        hypothesisOps: [],
        safetyTriggered: false,
        escalationSuggested: false,
        escalationReason: null,
        day21Reflection: null,
      },
    };
    return {
      draft,
      model: "deterministic_non_food",
      promptVersion: COACHING_AI_V2_PROMPT_VERSION,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, imageCount: 0 },
      latencyMs: 0,
      usedFixture: true,
      observability: baseObservability({
        model: "deterministic_non_food",
        memory: input.memory,
        draft,
      }),
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    if (!canUseFixtureCoachingAiProvider()) {
      throw new Error("AI Coach V2 unavailable: missing OPENAI_API_KEY");
    }
    const started = Date.now();
    const draft = generateFixtureV2Draft(input);
    if (safety.escalate) {
      draft.meta.escalationSuggested = true;
      draft.meta.escalationReason = safety.reasons.join(",") || draft.meta.escalationReason;
    }
    return {
      draft,
      model: "fixture-v2",
      promptVersion: COACHING_AI_V2_PROMPT_VERSION,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, imageCount: 0 },
      latencyMs: Date.now() - started,
      usedFixture: true,
      observability: baseObservability({
        model: "fixture-v2",
        memory: input.memory,
        draft,
      }),
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COACHING_DAILY_AI_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getCoachingDailyAiModelId(),
        temperature: 0.85,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "coaching_ai_v2_freeform",
            strict: false,
            schema: coachingAiV2OpenAiJsonSchema,
          },
        },
        messages: [
          { role: "system", content: buildCoachingAiV2SystemPrompt() },
          {
            role: "user",
            content: buildCoachingAiV2UserPrompt({
              generationInput: input.generationInput,
              decisionContext: input.decisionContext,
              memory: input.memory,
              channel,
              freeMessage: input.freeMessage,
              go21Goal: input.go21Goal,
              recentVisionObservations: input.recentVisionObservations,
              longitudinalUnderstanding: input.longitudinalUnderstanding,
              dailyTargetsState: input.dailyTargetsState,
              coachDailyPlan: input.coachDailyPlan,
              visionNonFood: input.visionNonFood,
              currentTurnEvidence: input.currentTurnEvidence,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI V2 coach failed: ${response.status} ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
    };
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("OpenAI V2 coach returned empty content");

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      // Salvage: sometimes models wrap JSON or add prose — try extract object
      const salvaged = salvageJsonObject(raw);
      if (!salvaged) throw new Error("OpenAI V2 coach returned non-JSON content");
      parsedJson = salvaged;
    }

    const parsed = parseCoachingAiV2Generation(parsedJson, {
      lifecycleDay: input.memory.lifecycle.dayNumber,
      lifecycleStage: input.memory.lifecycle.stage,
    });
    if (!parsed.ok) {
      // Last-chance: if coach_message exists as string, accept with empty meta
      const looseMessage = extractLooseCoachMessage(parsedJson);
      if (!looseMessage) {
        throw new Error(`OpenAI V2 coach schema invalid: ${parsed.error}`);
      }
      const draft = {
        coachMessage: looseMessage,
        meta: {
          intention: "casual" as const,
          lifecycleDay: input.memory.lifecycle.dayNumber,
          lifecycleStage: input.memory.lifecycle.stage,
          memoryWrites: [],
          openLoopOps: [],
          hypothesisOps: [],
          safetyTriggered: false,
          escalationSuggested: false,
          escalationReason: null,
          day21Reflection: null,
        },
      };
      const usageParsed = parseOpenAiChatCompletionUsage(json);
      return {
        draft,
        model: getCoachingDailyAiModelId(),
        promptVersion: COACHING_AI_V2_PROMPT_VERSION,
        usage: {
          inputTokens: usageParsed?.inputTokens ?? 0,
          cachedInputTokens: usageParsed?.cachedInputTokens ?? 0,
          outputTokens: usageParsed?.outputTokens ?? 0,
          imageCount: 0,
        },
        latencyMs: Date.now() - started,
        usedFixture: false,
        observability: baseObservability({
          model: getCoachingDailyAiModelId(),
          memory: input.memory,
          draft,
        }),
      };
    }

    if (safety.escalate) {
      parsed.data.meta.escalationSuggested = true;
      parsed.data.meta.escalationReason =
        safety.reasons.join(",") || parsed.data.meta.escalationReason;
    }

    const usageParsed = parseOpenAiChatCompletionUsage(json);
    const usage = {
      inputTokens: usageParsed?.inputTokens ?? 0,
      cachedInputTokens: usageParsed?.cachedInputTokens ?? 0,
      outputTokens: usageParsed?.outputTokens ?? 0,
    };
    const model = getCoachingDailyAiModelId();
    return {
      draft: parsed.data,
      model,
      promptVersion: COACHING_AI_V2_PROMPT_VERSION,
      usage: {
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
        imageCount: 0,
      },
      latencyMs: Date.now() - started,
      usedFixture: false,
      observability: baseObservability({
        model,
        memory: input.memory,
        draft: parsed.data,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      }),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function baseObservability(input: {
  model: string;
  memory: CoachingAiV2MemoryBundle;
  draft: CoachingAiV2GenerationDraft;
  inputTokens?: number;
  outputTokens?: number;
}): CoachingAiV2Observability {
  return {
    model: input.model,
    promptVersion: COACHING_AI_V2_PROMPT_VERSION,
    lifecycleDay: input.memory.lifecycle.dayNumber,
    lifecycleStage: input.memory.lifecycle.stage,
    recentTurnsLoaded: input.memory.recentTurns.length,
    durableMemoryLoaded: input.memory.durableMemory.length,
    openLoopsLoaded: input.memory.openLoops.length,
    hypothesesLoaded: input.memory.hypotheses.length,
    memoryUpdateOutcome: "skipped",
    safetyTriggered: input.draft.meta.safetyTriggered,
    escalationSuggested: input.draft.meta.escalationSuggested,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    estimatedCostUsd: null,
  };
}

export function logCoachingAiV2Observability(
  obs: CoachingAiV2Observability & { enrollmentId?: string; logDate?: string },
): void {
  console.info(
    JSON.stringify({
      event: "coaching_ai_v2_observability",
      point_key: COACHING_AI_V2_POINT_KEY,
      enrollment_id: obs.enrollmentId ?? null,
      log_date: obs.logDate ?? null,
      model: obs.model,
      prompt_version: obs.promptVersion,
      lifecycle_day: obs.lifecycleDay,
      lifecycle_stage: obs.lifecycleStage,
      recent_turns: obs.recentTurnsLoaded,
      durable_memory: obs.durableMemoryLoaded,
      open_loops: obs.openLoopsLoaded,
      hypotheses: obs.hypothesesLoaded,
      memory_update: obs.memoryUpdateOutcome,
      safety: obs.safetyTriggered,
      escalation: obs.escalationSuggested,
      input_tokens: obs.inputTokens,
      output_tokens: obs.outputTokens,
    }),
  );
}

/** Extract a JSON object from messy model output (prose wrappers / code fences). */
function salvageJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function extractLooseCoachMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  for (const key of ["coach_message", "coachMessage", "message", "reply"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 4000);
  }
  return null;
}

function listHeavyFromDecision(decision: CoachingDecisionContext): string[] {
  const out: string[] = [];
  for (const obs of decision.mealObservations ?? []) {
    if (
      obs.signals.some((s) =>
        ["fried_food", "sugary_drink", "starch_concentrated"].includes(s),
      )
    ) {
      out.push(...obs.observedFoods.slice(0, 2));
    }
  }
  return out.slice(0, 4);
}
