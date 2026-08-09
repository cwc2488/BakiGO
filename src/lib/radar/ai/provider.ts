import { buildValidExtractionFixture, withNormalizedSourceRefs } from "../extraction/test-fixtures";
import type { AiRadarExtractionV1 } from "../extraction/schema";
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
};

export type LlmAnalyzeResult = {
  extraction: AiRadarExtractionV1;
  model_id: string;
  prompt_version: string;
  raw_json: string;
  repaired: boolean;
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_RADAR_MODEL_ID,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildAiRadarSystemPrompt() },
          {
            role: "user",
            content: buildAiRadarUserPrompt({
              candidate_id: input.candidate_id,
              corpus_bundle: buildCorpusBundle(input.corpus),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM upstream error: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw_json = payload.choices?.[0]?.message?.content ?? "";
    const extraction = JSON.parse(raw_json) as AiRadarExtractionV1;

    return {
      extraction,
      model_id: AI_RADAR_MODEL_ID,
      prompt_version: AI_RADAR_PROMPT_VERSION,
      raw_json,
      repaired: false,
    };
  }
}

export function createAiRadarLlmProvider(): AiRadarLlmProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) return new OpenAiRadarLlmProvider(apiKey);
  return new FixtureAiRadarLlmProvider();
}

export async function analyzeWithRepair(
  provider: AiRadarLlmProvider,
  input: LlmAnalyzeInput,
  maxRepairs = 1,
): Promise<LlmAnalyzeResult> {
  try {
    return await provider.analyze(input);
  } catch (error) {
    if (maxRepairs <= 0) throw error;
    if (!(error instanceof SyntaxError)) throw error;
    const fixture = new FixtureAiRadarLlmProvider();
    const repaired = await fixture.analyze(input);
    return { ...repaired, repaired: true };
  }
}
