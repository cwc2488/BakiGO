import { buildValidExtractionFixture, withNormalizedSourceRefs } from "../extraction/test-fixtures";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import {
  buildOpenAiExtractionResponseFormat,
  omitJsonNulls,
} from "../extraction/openai-structured-schema";
import type { CandidateContentCorpus } from "../normalization/schema";
import {
  AI_RADAR_MODEL_ID,
  AI_RADAR_PROMPT_VERSION,
  buildAiRadarSystemPrompt,
  buildAiRadarUserPrompt,
} from "./prompt";

export type LlmAnalyzeInput = {
  candidate_id: string;
  corpus: CandidateContentCorpus;
  /** Single bounded re-ask with the same evidence after a contract violation. */
  repair?: { issues: string[] };
};

export type LlmUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type LlmAnalyzeResult = {
  extraction: AiRadarExtractionV1;
  model_id: string;
  prompt_version: string;
  raw_json: string;
  repaired: boolean;
  usage?: LlmUsage | null;
};

export interface AiRadarLlmProvider {
  analyze(input: LlmAnalyzeInput): Promise<LlmAnalyzeResult>;
}

function buildCorpusBundle(corpus: CandidateContentCorpus) {
  return {
    candidate_id: corpus.candidate_id,
    normalization_run_id: corpus.normalization_run_id,
    analyzable_items: corpus.items
      .filter((item) => item.is_analyzable)
      .map((item) => ({
        normalized_content_id: item.normalized_content_id,
        platform: item.platform,
        published_at: item.published_at,
        text: item.text,
        candidate_commentary_text: item.candidate_commentary_text,
      })),
  };
}

export class FixtureAiRadarLlmProvider implements AiRadarLlmProvider {
  async analyze(input: LlmAnalyzeInput): Promise<LlmAnalyzeResult> {
    const firstItem = input.corpus.items.find((item) => item.is_analyzable);
    const extraction = withNormalizedSourceRefs(
      {
        ...buildValidExtractionFixture(),
        candidate_id: input.candidate_id,
      },
      firstItem?.normalized_content_id ?? "norm_body_comp_001",
      firstItem?.platform ?? "threads",
    );

    return {
      extraction,
      model_id: "fixture_llm_v1",
      prompt_version: AI_RADAR_PROMPT_VERSION,
      raw_json: JSON.stringify(extraction),
      repaired: false,
    };
  }
}

export class OpenAiRadarLlmProvider implements AiRadarLlmProvider {
  constructor(private readonly apiKey: string) {}

  async analyze(input: LlmAnalyzeInput): Promise<LlmAnalyzeResult> {
    const bundle = buildCorpusBundle(input.corpus);
    const allowedContentIds = bundle.analyzable_items.map(
      (item) => item.normalized_content_id,
    );

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_RADAR_MODEL_ID,
        response_format: buildOpenAiExtractionResponseFormat({ allowedContentIds }),
        messages: [
          { role: "system", content: buildAiRadarSystemPrompt() },
          {
            role: "user",
            content: buildAiRadarUserPrompt({
              candidate_id: input.candidate_id,
              corpus_bundle: bundle,
              allowed_source_ref_content_ids: allowedContentIds,
              repair: input.repair,
            }),
          },
        ],
      }),
    });

    const payload = (await response.json()) as {
      error?: { message?: string; code?: string; param?: string; type?: string };
      choices?: Array<{
        message?: { content?: string | null; refusal?: string | null };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    if (!response.ok) {
      const message = payload.error?.message ?? `LLM upstream error: ${response.status}`;
      if (/json_schema|structured output/i.test(message)) {
        throw new Error(
          `OPENAI_STRUCTURED_OUTPUTS_UNSUPPORTED: model ${AI_RADAR_MODEL_ID} rejected json_schema (${message})`,
        );
      }
      throw new Error(message);
    }

    const message = payload.choices?.[0]?.message;
    if (message?.refusal) {
      throw new Error(`LLM refusal: ${message.refusal}`);
    }
    const raw_json = message?.content ?? "";
    if (!raw_json.trim()) {
      throw new Error("LLM returned empty structured output.");
    }

    const extraction = omitJsonNulls(JSON.parse(raw_json)) as AiRadarExtractionV1;

    return {
      extraction,
      model_id: AI_RADAR_MODEL_ID,
      prompt_version: AI_RADAR_PROMPT_VERSION,
      raw_json,
      repaired: Boolean(input.repair),
      usage: payload.usage
        ? {
            prompt_tokens: payload.usage.prompt_tokens ?? 0,
            completion_tokens: payload.usage.completion_tokens ?? 0,
            total_tokens: payload.usage.total_tokens ?? 0,
          }
        : null,
    };
  }
}

export function createAiRadarLlmProvider(): AiRadarLlmProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) return new OpenAiRadarLlmProvider(apiKey);
  return new FixtureAiRadarLlmProvider();
}

export function requireOpenAiRadarLlmProvider(): OpenAiRadarLlmProvider {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is absent; refusing FixtureAiRadarLlmProvider.");
  }
  return new OpenAiRadarLlmProvider(apiKey);
}

export async function analyzeWithRepair(
  provider: AiRadarLlmProvider,
  input: LlmAnalyzeInput,
  maxRepairs = 1,
  options?: { allowFixtureRepair?: boolean },
): Promise<LlmAnalyzeResult> {
  try {
    return await provider.analyze(input);
  } catch (error) {
    if (maxRepairs <= 0) throw error;
    if (!(error instanceof SyntaxError)) throw error;
    const allowFixtureRepair = options?.allowFixtureRepair ?? process.env.NODE_ENV === "test";
    if (!allowFixtureRepair) throw error;
    const fixture = new FixtureAiRadarLlmProvider();
    const repaired = await fixture.analyze(input);
    return { ...repaired, repaired: true };
  }
}
