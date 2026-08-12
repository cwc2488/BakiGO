import {
  type CoachingDailyGenerationOutputJson,
  type CoachingGenerationInput,
  type CoachingInterventionLevel,
  type PreparedCoachingMealImage,
} from "@/types/coaching-ai";
import {
  buildCoachingDailyCoachImageIntro,
  buildCoachingDailyCoachSystemPrompt,
  buildCoachingDailyCoachUserPrompt,
} from "@/lib/coaching/ai/coaching-daily-coach-prompts";
import {
  coachingDailyGenerationOpenAiJsonSchema,
  parseCoachingDailyGenerationOutput,
} from "@/lib/coaching/ai/coaching-daily-output-schema";
import {
  COACHING_DAILY_AI_MODEL_ID,
  COACHING_DAILY_AI_OPENAI_IMAGE_DETAIL,
  COACHING_DAILY_AI_PROMPT_VERSION,
  COACHING_DAILY_AI_TIMEOUT_MS,
  COACHING_DAILY_AI_UNAVAILABLE_MESSAGE,
} from "@/lib/coaching/ai/model-config";
import { parseOpenAiChatCompletionUsage } from "@/lib/coaching/ai/parse-openai-usage";
import { encodePreparedCoachingMealImageAsBase64 } from "@/lib/coaching/ai/coaching-meal-image-processor";
import { FixtureCoachingAiProvider } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import type { CoachingDecisionContext } from "@/types/coaching-signals";

export type GenerateDailyCoachInput = {
  generationInput: CoachingGenerationInput;
  preparedMealImages: PreparedCoachingMealImage[];
  finalInterventionLevel: CoachingInterventionLevel;
  decisionContext: CoachingDecisionContext;
};

export type GenerateDailyCoachUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  imageCount: number;
};

export type GenerateDailyCoachResult = {
  output: CoachingDailyGenerationOutputJson;
  model: string;
  promptVersion: string;
  rawJson: string;
  usage: GenerateDailyCoachUsage;
  latencyMs: number;
};

export interface CoachingAiProvider {
  generateDailyCoach(input: GenerateDailyCoachInput): Promise<GenerateDailyCoachResult>;
}

export class CoachingAiConfigurationError extends Error {
  constructor(message = COACHING_DAILY_AI_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "CoachingAiConfigurationError";
  }
}

export function canUseFixtureCoachingAiProvider(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

export function isCoachingAiProviderAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim()) || canUseFixtureCoachingAiProvider();
}

type OpenAiMessageContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } };

export function buildOpenAiDailyCoachUserMessageContent(input: {
  generationInput: CoachingGenerationInput;
  finalInterventionLevel: CoachingInterventionLevel;
  preparedMealImages: PreparedCoachingMealImage[];
  decisionContext: CoachingDecisionContext;
}): OpenAiMessageContent[] {
  const content: OpenAiMessageContent[] = [
    {
      type: "text",
      text: buildCoachingDailyCoachUserPrompt(input),
    },
  ];

  for (const image of input.preparedMealImages) {
    content.push({
      type: "text",
      text: buildCoachingDailyCoachImageIntro(image.mealSlot),
    });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${encodePreparedCoachingMealImageAsBase64(image)}`,
        detail: COACHING_DAILY_AI_OPENAI_IMAGE_DETAIL,
      },
    });
  }

  return content;
}

export async function callOpenAiDailyCoachStructuredOutput(input: {
  apiKey: string;
  generationInput: CoachingGenerationInput;
  finalInterventionLevel: CoachingInterventionLevel;
  preparedMealImages: PreparedCoachingMealImage[];
  decisionContext: CoachingDecisionContext;
}): Promise<{ rawJson: string; usage: GenerateDailyCoachUsage; latencyMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COACHING_DAILY_AI_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: COACHING_DAILY_AI_MODEL_ID,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "coaching_daily_generation",
            strict: true,
            schema: coachingDailyGenerationOpenAiJsonSchema,
          },
        },
        messages: [
          { role: "system", content: buildCoachingDailyCoachSystemPrompt() },
          {
            role: "user",
            content: buildOpenAiDailyCoachUserMessageContent(input),
          },
        ],
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      throw new Error(`LLM upstream error: ${response.status}`);
    }

    const payload = await response.json();
    const rawJson = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message
      ?.content;
    if (!rawJson) {
      throw new Error("LLM returned empty content.");
    }

    const parsedUsage = parseOpenAiChatCompletionUsage(payload);
    return {
      rawJson,
      latencyMs,
      usage: {
        inputTokens: parsedUsage?.inputTokens ?? 0,
        cachedInputTokens: parsedUsage?.cachedInputTokens ?? 0,
        outputTokens: parsedUsage?.outputTokens ?? 0,
        imageCount: input.preparedMealImages.length,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDailyCoachDraftJson(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const root = value as Record<string, unknown>;
  const customer = root.customer;
  if (!customer || typeof customer !== "object") {
    return value;
  }
  const customerRecord = customer as Record<string, unknown>;
  if (typeof customerRecord.tomorrow_focus !== "string" || customerRecord.tomorrow_focus.trim().length === 0) {
    customerRecord.tomorrow_focus = "維持目前節奏";
  }
  if (typeof customerRecord.encouragement !== "string" || customerRecord.encouragement.trim().length === 0) {
    customerRecord.encouragement = "持續回報很重要，我們一起往前。";
  }
  if (typeof customerRecord.today_feedback !== "string" || customerRecord.today_feedback.trim().length === 0) {
    customerRecord.today_feedback = "今天先依系統重點調整即可。";
  }
  if (typeof customerRecord.daily_food_summary !== "string" || customerRecord.daily_food_summary.trim().length === 0) {
    customerRecord.daily_food_summary = "今天有餐點回報，細節我們再一起看。";
  }
  if (!customerRecord.meal_feedback || typeof customerRecord.meal_feedback !== "object") {
    customerRecord.meal_feedback = { breakfast: null, lunch: null, dinner: null };
  }
  if (!customerRecord.lifestyle_feedback || typeof customerRecord.lifestyle_feedback !== "object") {
    customerRecord.lifestyle_feedback = { hydration: null, sleep: null, exercise: null };
  }
  if (!("customer_voice_response" in customerRecord)) {
    customerRecord.customer_voice_response = null;
  }
  if (!("follow_up_for_tomorrow" in customerRecord)) {
    customerRecord.follow_up_for_tomorrow = null;
  }
  if (!Array.isArray(customerRecord.adjustment_priorities)) {
    customerRecord.adjustment_priorities = [];
  }

  const coach = root.coach;
  if (coach && typeof coach === "object") {
    const coachRecord = coach as Record<string, unknown>;
    if (!Array.isArray(coachRecord.follow_ups)) {
      coachRecord.follow_ups = [];
    }
    if (!Array.isArray(coachRecord.photo_reuse_flags)) {
      coachRecord.photo_reuse_flags = [];
    }
    if (!("daily_nutrition_assessment" in coachRecord)) {
      coachRecord.daily_nutrition_assessment = null;
    }
  }
  return root;
}

export function parseDailyCoachProviderJson(rawJson: string): CoachingDailyGenerationOutputJson {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch {
    throw new Error("LLM returned invalid JSON.");
  }

  const parsed = parseCoachingDailyGenerationOutput(normalizeDailyCoachDraftJson(parsedJson));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.data;
}

export class OpenAiCoachingAiProvider implements CoachingAiProvider {
  constructor(private readonly apiKey: string) {}

  async generateDailyCoach(input: GenerateDailyCoachInput): Promise<GenerateDailyCoachResult> {
    const upstream = await callOpenAiDailyCoachStructuredOutput({
      apiKey: this.apiKey,
      generationInput: input.generationInput,
      finalInterventionLevel: input.finalInterventionLevel,
      preparedMealImages: input.preparedMealImages,
      decisionContext: input.decisionContext,
    });

    const output = applyCoachingDecisionContextToOutput(
      parseDailyCoachProviderJson(upstream.rawJson),
      input.decisionContext,
    );

    return {
      output,
      model: COACHING_DAILY_AI_MODEL_ID,
      promptVersion: COACHING_DAILY_AI_PROMPT_VERSION,
      rawJson: upstream.rawJson,
      usage: upstream.usage,
      latencyMs: upstream.latencyMs,
    };
  }
}

export function createCoachingAiProvider(): CoachingAiProvider {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    return new OpenAiCoachingAiProvider(apiKey);
  }
  if (canUseFixtureCoachingAiProvider()) {
    return new FixtureCoachingAiProvider();
  }
  throw new CoachingAiConfigurationError();
}