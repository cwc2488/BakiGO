import type {
  BarrierInsightInputSnapshot,
  BarrierInsightOutput,
  MotivationInsightInputSnapshot,
  MotivationInsightOutput,
} from "@/types/consultation-ai";
import {
  CONSULTATION_AI_MODEL_ID,
  CONSULTATION_AI_PROMPT_VERSION,
  CONSULTATION_AI_TIMEOUT_MS,
  CONSULTATION_AI_UNAVAILABLE_MESSAGE,
} from "./constants";
import {
  buildBarrierInsightSystemPrompt,
  buildBarrierInsightUserPrompt,
  buildMotivationInsightSystemPrompt,
  buildMotivationInsightUserPrompt,
} from "./prompts";
import {
  barrierInsightOpenAiJsonSchema,
  motivationInsightOpenAiJsonSchema,
  parseBarrierInsightOutput,
  parseMotivationInsightOutput,
} from "./schema";

export type ConsultationAiGenerateResult<T> = {
  output: T;
  model: string;
  promptVersion: string;
  rawJson: string;
};

export interface ConsultationAiLlmProvider {
  generateMotivationInsight(
    input: MotivationInsightInputSnapshot,
  ): Promise<ConsultationAiGenerateResult<MotivationInsightOutput>>;
  generateBarrierInsight(
    input: BarrierInsightInputSnapshot,
  ): Promise<ConsultationAiGenerateResult<BarrierInsightOutput>>;
}

export class ConsultationAiConfigurationError extends Error {
  constructor(message = CONSULTATION_AI_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "ConsultationAiConfigurationError";
  }
}

export function canUseFixtureConsultationAiProvider(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

function pickPrimaryReason(input: MotivationInsightInputSnapshot): string {
  return (
    input.motivations?.reason1?.trim() ||
    input.motivations?.reason2?.trim() ||
    input.motivations?.reason3?.trim() ||
    "尚未清楚記錄"
  );
}

export class FixtureConsultationAiProvider implements ConsultationAiLlmProvider {
  async generateMotivationInsight(
    input: MotivationInsightInputSnapshot,
  ): Promise<ConsultationAiGenerateResult<MotivationInsightOutput>> {
    const primary = pickPrimaryReason(input);
    const output: MotivationInsightOutput = {
      coreMotivation: primary,
      motivationSummary: `從已記錄的理由來看，客人最在意的是「${primary}」。`,
      signals: [primary, input.goal?.goalType ? `目標類型：${input.goal.goalType}` : "目標尚未細化"].filter(
        Boolean,
      ) as string[],
      recommendedFollowUpQuestion: "如果這個理由真的實現，你的日常生活會最先出現哪一個改變？",
      coachNote: "這是依現有資料整理的教練提示，請以客人原話再確認。",
      confidence: 0.55,
    };

    return {
      output,
      model: "fixture_consultation_ai_v1",
      promptVersion: CONSULTATION_AI_PROMPT_VERSION,
      rawJson: JSON.stringify(output),
    };
  }

  async generateBarrierInsight(
    input: BarrierInsightInputSnapshot,
  ): Promise<ConsultationAiGenerateResult<BarrierInsightOutput>> {
    const stated =
      input.barriers?.barrierNotes?.trim() ||
      (input.barriers?.barriers?.length
        ? `已選阻礙：${input.barriers.barriers.join(", ")}`
        : "客人尚未具體說明阻礙");

    const output: BarrierInsightOutput = {
      surfaceBarrier: stated,
      possibleUnderlyingBarrier:
        "資料仍有限，可能與時間/優先順序或過往挫折有關，但需要更多原話確認。",
      evidence: [
        `決心 ${input.commitmentScore} 分，表示有意愿但仍有保留`,
        stated,
      ],
      recommendedQuestion: "如果這個卡關點能先解決一小步，你會願意從哪裡開始？",
      coachNote: "請區分客人說出口的阻礙與你的推測，不要直接當成結論。",
      confidence: 0.5,
    };

    return {
      output,
      model: "fixture_consultation_ai_v1",
      promptVersion: CONSULTATION_AI_PROMPT_VERSION,
      rawJson: JSON.stringify(output),
    };
  }
}

type OpenAiStructuredOutputFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: typeof motivationInsightOpenAiJsonSchema | typeof barrierInsightOpenAiJsonSchema;
  };
};

async function callOpenAiStructuredOutput(input: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  responseFormat: OpenAiStructuredOutputFormat;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONSULTATION_AI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CONSULTATION_AI_MODEL_ID,
        response_format: input.responseFormat,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LLM upstream error: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

export class OpenAiConsultationAiProvider implements ConsultationAiLlmProvider {
  constructor(private readonly apiKey: string) {}

  async generateMotivationInsight(
    input: MotivationInsightInputSnapshot,
  ): Promise<ConsultationAiGenerateResult<MotivationInsightOutput>> {
    const rawJson = await callOpenAiStructuredOutput({
      apiKey: this.apiKey,
      systemPrompt: buildMotivationInsightSystemPrompt(),
      userPrompt: buildMotivationInsightUserPrompt(input),
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "motivation_insight",
          strict: true,
          schema: motivationInsightOpenAiJsonSchema,
        },
      },
    });
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawJson);
    } catch {
      throw new Error("LLM returned invalid JSON.");
    }
    const parsed = parseMotivationInsightOutput(parsedJson);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return {
      output: parsed.data,
      model: CONSULTATION_AI_MODEL_ID,
      promptVersion: CONSULTATION_AI_PROMPT_VERSION,
      rawJson,
    };
  }

  async generateBarrierInsight(
    input: BarrierInsightInputSnapshot,
  ): Promise<ConsultationAiGenerateResult<BarrierInsightOutput>> {
    const rawJson = await callOpenAiStructuredOutput({
      apiKey: this.apiKey,
      systemPrompt: buildBarrierInsightSystemPrompt(),
      userPrompt: buildBarrierInsightUserPrompt(input),
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "barrier_insight",
          strict: true,
          schema: barrierInsightOpenAiJsonSchema,
        },
      },
    });
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawJson);
    } catch {
      throw new Error("LLM returned invalid JSON.");
    }
    const parsed = parseBarrierInsightOutput(parsedJson);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    return {
      output: parsed.data,
      model: CONSULTATION_AI_MODEL_ID,
      promptVersion: CONSULTATION_AI_PROMPT_VERSION,
      rawJson,
    };
  }
}

export function createConsultationAiProvider(): ConsultationAiLlmProvider {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    return new OpenAiConsultationAiProvider(apiKey);
  }
  if (canUseFixtureConsultationAiProvider()) {
    return new FixtureConsultationAiProvider();
  }
  throw new ConsultationAiConfigurationError();
}
