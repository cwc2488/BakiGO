import { describe, expect, it, vi } from "vitest";
import { buildLlmCallLogEntry } from "@/lib/ai/llm-telemetry";
import {
  buildCoachingAiFixtureGenerationInput,
} from "@/lib/coaching/ai/coaching-ai-fixtures";
import {
  buildOpenAiDailyCoachUserMessageContent,
  callOpenAiDailyCoachStructuredOutput,
  CoachingAiConfigurationError,
  createCoachingAiProvider,
  OpenAiCoachingAiProvider,
  parseDailyCoachProviderJson,
} from "@/lib/coaching/ai/coaching-ai-provider";
import {
  coachingDailyGenerationOpenAiJsonSchema,
  parseCoachingDailyGenerationOutput,
} from "@/lib/coaching/ai/coaching-daily-output-schema";
import {
  buildCoachingDailyCoachSystemPrompt,
  buildCoachingDailyCoachUserPrompt,
} from "@/lib/coaching/ai/coaching-daily-coach-prompts";
import { FixtureCoachingAiProvider, getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import { generateDailyCoachWithTelemetry } from "@/lib/coaching/ai/generate-daily-coach";
import {
  COACHING_DAILY_AI_MODEL_ID,
  COACHING_DAILY_AI_PROMPT_VERSION,
  COACHING_DAILY_AI_TIMEOUT_MS,
  COACHING_DAILY_AI_UNAVAILABLE_MESSAGE,
} from "@/lib/coaching/ai/model-config";
import { parseOpenAiChatCompletionUsage } from "@/lib/coaching/ai/parse-openai-usage";
import type { PreparedCoachingMealImage } from "@/types/coaching-ai";

function preparedImage(mealSlot: PreparedCoachingMealImage["mealSlot"]): PreparedCoachingMealImage {
  return {
    mealSlot,
    sourceStoragePath: `fixture-cust/fixture-enroll/2026-08-11/${mealSlot}/photo.jpg`,
    mimeType: "image/jpeg",
    width: 640,
    height: 480,
    byteLength: 1200,
    buffer: Buffer.from("fake-image"),
    originalWidth: 800,
    originalHeight: 600,
    originalByteLength: 2400,
  };
}

describe("coaching daily generation schema", () => {
  it("validates structured output with max 2 priorities", () => {
    const output = getFixtureScenarioOutput("A_normal");
    expect(parseCoachingDailyGenerationOutput(output).ok).toBe(true);
    expect(output.customer.adjustment_priorities.length).toBeLessThanOrEqual(2);
  });

  it("rejects malformed output", () => {
    expect(
      parseCoachingDailyGenerationOutput({
        version: 1,
        customer: {
          encouragement: "a",
          today_feedback: "b",
          adjustment_priorities: ["1", "2", "3"],
          tomorrow_focus: "c",
        },
        coach: {
          daily_summary: "s",
          recurring_issue: null,
          improved_issue: null,
          proposed_intervention_level: "normal",
          coach_attention_required: false,
          attention_reason: null,
          evidence: [],
        },
      }).ok,
    ).toBe(false);
  });
});

describe("model config", () => {
  it("uses centralized model and prompt version", () => {
    expect(COACHING_DAILY_AI_MODEL_ID).toBe("gpt-4o-mini-2024-07-18");
    expect(COACHING_DAILY_AI_PROMPT_VERSION).toBe("coaching_daily_v1");
    expect(COACHING_DAILY_AI_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe("provider factory", () => {
  it("does not use fixture provider in production without OPENAI_API_KEY", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENAI_API_KEY", "");

    expect(() => createCoachingAiProvider()).toThrow(CoachingAiConfigurationError);
    expect(() => createCoachingAiProvider()).toThrow(COACHING_DAILY_AI_UNAVAILABLE_MESSAGE);

    vi.unstubAllEnvs();
  });
});

describe("prompt architecture", () => {
  it("includes finalInterventionLevel and prior AI provenance guidance", () => {
    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const systemPrompt = buildCoachingDailyCoachSystemPrompt();
    const userPrompt = buildCoachingDailyCoachUserPrompt({
      generationInput,
      finalInterventionLevel,
      preparedMealImages: [],
    });

    expect(systemPrompt).toContain("持續 > 完美");
    expect(systemPrompt).toContain("priorAiContext");
    expect(systemPrompt).toContain("finalInterventionLevel");
    expect(userPrompt).toContain("finalInterventionLevel = watch");
    expect(userPrompt).toContain("priorAiInference");
  });
});

describe("OpenAiCoachingAiProvider", () => {
  it("maps mealSlot labels into multimodal request content", async () => {
    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("A_normal");
    const images = [preparedImage("breakfast"), preparedImage("lunch")];
    const content = buildOpenAiDailyCoachUserMessageContent({
      generationInput,
      finalInterventionLevel,
      preparedMealImages: images,
    });

    expect(content.some((part) => part.type === "text" && part.text.includes("breakfast"))).toBe(true);
    expect(content.filter((part) => part.type === "image_url")).toHaveLength(2);
  });

  it("uses structured outputs json_schema aligned with Zod", async () => {
    const payload = getFixtureScenarioOutput("A_normal");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(payload) } }],
        usage: {
          prompt_tokens: 900,
          completion_tokens: 220,
          prompt_tokens_details: { cached_tokens: 100 },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("A_normal");
    const provider = new OpenAiCoachingAiProvider("test-key");
    const result = await provider.generateDailyCoach({
      generationInput,
      finalInterventionLevel,
      preparedMealImages: [preparedImage("breakfast")],
    });

    expect(parseCoachingDailyGenerationOutput(result.output).ok).toBe(true);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.model).toBe(COACHING_DAILY_AI_MODEL_ID);
    expect(requestBody.response_format.json_schema.schema).toEqual(coachingDailyGenerationOpenAiJsonSchema);

    vi.unstubAllGlobals();
  });

  it("fails on malformed OpenAI JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "{bad" } }] }),
      }),
    );

    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("A_normal");
    const provider = new OpenAiCoachingAiProvider("test-key");
    await expect(
      provider.generateDailyCoach({ generationInput, finalInterventionLevel, preparedMealImages: [] }),
    ).rejects.toThrow("invalid JSON");

    vi.unstubAllGlobals();
  });
});

describe("parseOpenAiChatCompletionUsage", () => {
  it("parses token usage including cached tokens", () => {
    expect(
      parseOpenAiChatCompletionUsage({
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 300,
          prompt_tokens_details: { cached_tokens: 150 },
        },
      }),
    ).toEqual({
      inputTokens: 1000,
      cachedInputTokens: 150,
      outputTokens: 300,
    });
  });
});

describe("telemetry", () => {
  it("builds llm call log entry with image count and unknown pricing null", () => {
    const entry = buildLlmCallLogEntry({
      feature: "coaching",
      pointKey: "daily_coach_generation",
      customerId: "fixture-cust",
      enrollmentId: "fixture-enroll",
      ownerMemberId: null,
      model: "unknown-model",
      promptVersion: COACHING_DAILY_AI_PROMPT_VERSION,
      usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, imageCount: 2 },
      latencyMs: 1200,
    });

    expect(entry.imageCount).toBe(2);
    expect(entry.estimatedCostUsd).toBeNull();
    expect(entry.pricingFound).toBe(false);
  });

  it("records telemetry from fixture provider without persisting image bytes", async () => {
    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("B_breakfast_deviation");
    const { result, telemetryEntry } = await generateDailyCoachWithTelemetry({
      provider: new FixtureCoachingAiProvider(),
      request: {
        generationInput,
        finalInterventionLevel,
        preparedMealImages: [preparedImage("breakfast")],
      },
      imageUsageMetadata: {
        selectedImageCount: 1,
        originalTotalBytes: 2400,
        processedTotalBytes: 1200,
        failedImageCount: 0,
        images: [],
      },
      persistTelemetry: false,
    });

    expect(result.output.customer.adjustment_priorities.length).toBeLessThanOrEqual(2);
    expect(telemetryEntry.status).toBe("completed");
    expect(JSON.stringify(telemetryEntry)).not.toContain("fake-image");
    expect(JSON.stringify(telemetryEntry.imageUsageMetadata)).not.toContain("base64");
  });
});

describe("fixture scenarios A/B/C", () => {
  it("returns schema-valid outputs for all fixture days", async () => {
    const provider = new FixtureCoachingAiProvider();

    for (const scenario of ["A_normal", "B_breakfast_deviation", "C_watch_pattern"] as const) {
      const fixture = buildCoachingAiFixtureGenerationInput(scenario);
      const result = await provider.generateDailyCoach({
        generationInput: fixture.generationInput,
        finalInterventionLevel: fixture.finalInterventionLevel,
        preparedMealImages: [],
      });

      expect(parseCoachingDailyGenerationOutput(result.output).ok).toBe(true);
      if (scenario === "B_breakfast_deviation") {
        expect(result.output.customer.today_feedback).toContain("蛋餅");
      }
      if (scenario === "C_watch_pattern") {
        expect(result.output.coach.recurring_issue).toContain("早餐");
      }
    }
  });
});

describe("parseDailyCoachProviderJson", () => {
  it("throws on schema mismatch so callers cannot persist completed", () => {
    expect(() =>
      parseDailyCoachProviderJson(
        JSON.stringify({
          version: 1,
          customer: {
            encouragement: "a",
            today_feedback: "b",
            adjustment_priorities: ["1", "2", "3"],
            tomorrow_focus: "c",
          },
          coach: {
            daily_summary: "s",
            recurring_issue: null,
            improved_issue: null,
            proposed_intervention_level: "normal",
            coach_attention_required: false,
            attention_reason: null,
            evidence: [],
          },
        }),
      ),
    ).toThrow();
  });
});

describe("callOpenAiDailyCoachStructuredOutput", () => {
  it("includes image count in usage", async () => {
    const payload = getFixtureScenarioOutput("A_normal");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(payload) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      }),
    );

    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("A_normal");
    const upstream = await callOpenAiDailyCoachStructuredOutput({
      apiKey: "test-key",
      generationInput,
      finalInterventionLevel,
      preparedMealImages: [preparedImage("breakfast"), preparedImage("dinner")],
    });

    expect(upstream.usage.imageCount).toBe(2);
    vi.unstubAllGlobals();
  });
});
