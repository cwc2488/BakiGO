import type { CoachingGenerationInput, CoachingInterventionLevel } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type {
  CoachingAiV2GenerationDraft,
  CoachingAiV2MemoryBundle,
  CoachingAiV2Observability,
} from "@/types/coaching-ai-v2";
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
      throw new Error("OpenAI V2 coach returned non-JSON content");
    }

    const parsed = parseCoachingAiV2Generation(parsedJson, {
      lifecycleDay: input.memory.lifecycle.dayNumber,
      lifecycleStage: input.memory.lifecycle.stage,
    });
    if (!parsed.ok) {
      throw new Error(`OpenAI V2 coach schema invalid: ${parsed.error}`);
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
