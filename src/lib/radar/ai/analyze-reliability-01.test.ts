import { describe, expect, it } from "vitest";
import { buildValidExtractionFixture } from "../extraction/test-fixtures";
import { validateAiRadarExtraction } from "../extraction/validate-ai-radar-extraction";
import { omitJsonNulls } from "../extraction/openai-structured-schema";
import {
  emptyUnderstanding,
  evaluateSemanticEligibility,
} from "../semantics/candidate-understanding";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../normalization/test-fixtures";
import {
  computeProviderRetrySleepMs,
  OpenAiRadarLlmProvider,
} from "../ai/provider";
import {
  classifyOpenAiHttpError,
  isTransientLlmError,
} from "../ai/llm-request-error";
import { resolveRetryPolicy, resolveNextJobStatus } from "../jobs/retry-policy";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";

function extractionWithUnderstanding(
  overrides: Parameters<typeof emptyUnderstanding>[0] = {},
) {
  return {
    ...buildValidExtractionFixture(),
    candidate_understanding: {
      ...emptyUnderstanding(overrides),
      source_refs: [],
    },
  };
}

describe("RADAR-ANALYZE-RELIABILITY-01", () => {
  it("accepts complete v1.2 extraction including candidate_understanding", () => {
    const result = validateAiRadarExtraction(
      extractionWithUnderstanding({
        need_owner: "self",
        need_state: "unresolved",
        primary_language: "zh-Hant",
        traditional_chinese_usable: "true",
        recommendation_reason_zh: "本人減脂需求尚未解決",
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.candidate_understanding?.need_owner).toBe("self");
  });

  it("does not invent semantic eligibility when required-nullable fields are null", () => {
    const mapped = omitJsonNulls(
      extractionWithUnderstanding({
        need_owner: "unknown",
        need_state: "unknown",
        unresolved_gap: null,
        recommendation_reason_zh: null,
      }),
    );
    const validated = validateAiRadarExtraction(mapped);
    expect(validated.success).toBe(true);
    if (!validated.success) return;
    const semantic = evaluateSemanticEligibility(validated.data.candidate_understanding);
    expect(semantic.eligible).toBe(false);
  });

  it("fails incomplete v1.2 understanding when required semantic enums are missing", () => {
    const incomplete = {
      ...buildValidExtractionFixture(),
      candidate_understanding: {
        need_owner: "self",
        market_role: "consumer",
        need_category: "fat_loss",
        pain_points: [],
        attempts: [],
        unresolved_gap: null,
        urgency: "medium",
        help_seeking: "implicit",
        evidence_confidence: 0.5,
        primary_language: "zh-Hant",
        traditional_chinese_usable: "true",
        candidate_region: null,
        region_confidence: "unknown",
        region_evidence: null,
        recommendation_reason_zh: null,
        source_refs: [],
      },
    };
    const result = validateAiRadarExtraction(incomplete);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.some((issue) => issue.path.includes("need_state"))).toBe(true);
  });

  it("keeps malformed structured output non-retryable at the job layer", () => {
    expect(resolveRetryPolicy("SCHEMA_VALIDATION").retryable).toBe(false);
    expect(
      resolveNextJobStatus({ retryable: false, attempt_count: 1, max_attempts: 5 }),
    ).toBe("dead_letter");
  });

  it("retries transient rate limit then succeeds inside provider bounds", async () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_rate",
      normalization_run_id: "norm_rate",
      snapshots: [buildRawSnapshot({ external_content_id: "th_rate", candidate_id: "cand_rate" })],
    });
    let calls = 0;
    const sleeps: number[] = [];
    const provider = new OpenAiRadarLlmProvider("test-key", {
      maxTransientAttempts: 3,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            JSON.stringify({ error: { message: "Rate limit reached for gpt-4.1-mini TPM" } }),
            { status: 429, headers: { "retry-after": "1" } },
          );
        }
        const extraction = omitJsonNulls({
          ...extractionWithUnderstanding(),
          candidate_id: "cand_rate",
        });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(extraction) } }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
          { status: 200 },
        );
      },
    });

    const result = await provider.analyze({ candidate_id: "cand_rate", corpus });
    expect(calls).toBe(2);
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
    expect(result.extraction.candidate_id).toBe("cand_rate");
  });

  it("exhausts repeated rate limits without infinite retry", async () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_rate2",
      normalization_run_id: "norm_rate2",
      snapshots: [buildRawSnapshot({ external_content_id: "th_rate2", candidate_id: "cand_rate2" })],
    });
    let calls = 0;
    const provider = new OpenAiRadarLlmProvider("test-key", {
      maxTransientAttempts: 3,
      sleep: async () => undefined,
      fetch: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({ error: { message: "Rate limit reached for gpt-4.1-mini" } }),
          { status: 429, headers: { "retry-after": "0" } },
        );
      },
    });

    await expect(provider.analyze({ candidate_id: "cand_rate2", corpus })).rejects.toMatchObject({
      code: "RATE_LIMIT",
    });
    expect(calls).toBe(3);
  });

  it("retries transient fetch failure then succeeds", async () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_net",
      normalization_run_id: "norm_net",
      snapshots: [buildRawSnapshot({ external_content_id: "th_net", candidate_id: "cand_net" })],
    });
    let calls = 0;
    const provider = new OpenAiRadarLlmProvider("test-key", {
      maxTransientAttempts: 3,
      sleep: async () => undefined,
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          throw new TypeError("fetch failed");
        }
        const extraction = omitJsonNulls({
          ...extractionWithUnderstanding(),
          candidate_id: "cand_net",
        });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(extraction) } }],
          }),
          { status: 200 },
        );
      },
    });

    const result = await provider.analyze({ candidate_id: "cand_net", corpus });
    expect(calls).toBe(2);
    expect(result.extraction.candidate_id).toBe("cand_net");
  });

  it("dead-letters permanent invalid input without retry", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-25T03:00:00.000Z");
    const { job } = await queue.enqueue(
      {
        job_type: "analyze",
        idempotency_key: "analyze:invalid",
        max_attempts: 5,
      },
      now,
    );
    await queue.claim({ limit: 1, now });
    const failed = await queue.fail({
      job_id: job.id,
      error_code: "MISSING_ARTIFACT",
      error_message: "normalize artifact not available for analyze",
      retryable: resolveRetryPolicy("MISSING_ARTIFACT").retryable,
      now,
    });
    expect(failed?.status).toBe("dead_letter");
  });

  it("keeps queue retry bounds for RATE_LIMIT and NETWORK", () => {
    const rate = resolveRetryPolicy("RATE_LIMIT");
    expect(rate.retryable).toBe(true);
    expect(rate.max_attempts).toBe(5);
    expect(
      resolveNextJobStatus({
        retryable: true,
        attempt_count: 5,
        max_attempts: rate.max_attempts,
      }),
    ).toBe("dead_letter");

    const network = resolveRetryPolicy("NETWORK");
    expect(network.retryable).toBe(true);
    expect(
      resolveNextJobStatus({
        retryable: true,
        attempt_count: 2,
        max_attempts: network.max_attempts,
      }),
    ).toBe("failed");
  });

  it("classifies OpenAI errors without remapping everything to SCHEMA_VALIDATION", () => {
    const rate = classifyOpenAiHttpError({
      status: 429,
      message: "Rate limit reached for gpt-4.1-mini",
      retryAfterHeader: "2",
    });
    expect(rate.code).toBe("RATE_LIMIT");
    expect(rate.retryAfterMs).toBe(2000);
    expect(isTransientLlmError(rate)).toBe(true);

    const server = classifyOpenAiHttpError({
      status: 503,
      message: "service unavailable",
    });
    expect(server.code).toBe("UPSTREAM_5XX");
  });

  it("caps provider sleep and respects Retry-After", () => {
    expect(
      computeProviderRetrySleepMs({
        attempt: 1,
        retryAfterMs: 5_000,
        random: () => 0,
      }),
    ).toBe(5_000);
    expect(
      computeProviderRetrySleepMs({
        attempt: 8,
        retryAfterMs: null,
        random: () => 0,
      }),
    ).toBe(20_000);
  });

  it("never fabricates understanding object from wire null", () => {
    const withoutUnderstanding = omitJsonNulls({
      ...buildValidExtractionFixture(),
      candidate_understanding: null,
    });
    const validated = validateAiRadarExtraction(withoutUnderstanding);
    expect(validated.success).toBe(true);
    if (!validated.success) return;
    expect(validated.data.candidate_understanding).toBeUndefined();
    expect(evaluateSemanticEligibility(undefined).reason).toBe("legacy_no_understanding");
  });
});
