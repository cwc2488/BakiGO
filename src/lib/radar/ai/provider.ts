import { buildValidExtractionFixture, withNormalizedSourceRefs } from "../extraction/test-fixtures";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import {
  buildOpenAiExtractionResponseFormat,
  mapOpenAiExtractionWireFormat,
} from "../extraction/openai-structured-schema";
import type { CandidateContentCorpus } from "../normalization/schema";
import {
  AI_RADAR_MODEL_ID,
  AI_RADAR_PROMPT_VERSION,
  buildAiRadarSystemPrompt,
  buildAiRadarUserPrompt,
} from "./prompt";
import {
  classifyFetchFailure,
  classifyOpenAiHttpError,
  isRadarLlmRequestError,
  isTransientLlmError,
  RadarLlmRequestError,
} from "./llm-request-error";

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

/** Provider-local transient retries (per job attempt). Keeps AUTO-01 budget safe. */
export const OPENAI_ANALYZE_TRANSIENT_MAX_ATTEMPTS = 3;
export const OPENAI_ANALYZE_RETRY_BASE_MS = 2_000;
export const OPENAI_ANALYZE_RETRY_MAX_SLEEP_MS = 20_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeProviderRetrySleepMs(input: {
  attempt: number;
  retryAfterMs?: number | null;
  baseMs?: number;
  maxMs?: number;
  random?: () => number;
}): number {
  const base = input.baseMs ?? OPENAI_ANALYZE_RETRY_BASE_MS;
  const maxMs = input.maxMs ?? OPENAI_ANALYZE_RETRY_MAX_SLEEP_MS;
  const random = input.random ?? Math.random;
  const exponential = base * Math.pow(2, Math.max(0, input.attempt - 1));
  const jitter = Math.floor(random() * base);
  const fromRetryAfter =
    typeof input.retryAfterMs === "number" && input.retryAfterMs > 0
      ? input.retryAfterMs
      : 0;
  return Math.min(maxMs, Math.max(exponential + jitter, fromRetryAfter));
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
  constructor(
    private readonly apiKey: string,
    private readonly options?: {
      maxTransientAttempts?: number;
      sleep?: (ms: number) => Promise<void>;
      fetch?: typeof fetch;
      random?: () => number;
    },
  ) {}

  async analyze(input: LlmAnalyzeInput): Promise<LlmAnalyzeResult> {
    const maxAttempts = this.options?.maxTransientAttempts ?? OPENAI_ANALYZE_TRANSIENT_MAX_ATTEMPTS;
    const sleeper = this.options?.sleep ?? sleep;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.analyzeOnce(input);
      } catch (error) {
        lastError = error;
        if (!isTransientLlmError(error) || attempt >= maxAttempts) {
          throw error;
        }
        const waitMs = computeProviderRetrySleepMs({
          attempt,
          retryAfterMs: isRadarLlmRequestError(error) ? error.retryAfterMs : null,
          random: this.options?.random,
        });
        await sleeper(waitMs);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new RadarLlmRequestError("LLM analyze failed", "LLM_UPSTREAM");
  }

  private async analyzeOnce(input: LlmAnalyzeInput): Promise<LlmAnalyzeResult> {
    const bundle = buildCorpusBundle(input.corpus);
    const allowedContentIds = bundle.analyzable_items.map(
      (item) => item.normalized_content_id,
    );
    const fetchImpl = this.options?.fetch ?? fetch;

    let response: Response;
    try {
      response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
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
    } catch (error) {
      throw classifyFetchFailure(error);
    }

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
      throw classifyOpenAiHttpError({
        status: response.status,
        message,
        retryAfterHeader: response.headers.get("retry-after"),
      });
    }

    const message = payload.choices?.[0]?.message;
    if (message?.refusal) {
      throw new RadarLlmRequestError(`LLM refusal: ${message.refusal}`, "LLM_UPSTREAM");
    }
    const raw_json = message?.content ?? "";
    if (!raw_json.trim()) {
      throw new RadarLlmRequestError("LLM returned empty structured output.", "LLM_INVALID_JSON");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw_json);
    } catch (error) {
      throw new RadarLlmRequestError(
        error instanceof Error ? error.message : "LLM returned invalid JSON",
        "LLM_INVALID_JSON",
        { cause: error },
      );
    }

    const extraction = mapOpenAiExtractionWireFormat(parsed) as AiRadarExtractionV1;

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
