import { describe, expect, it, vi } from "vitest";
import { buildValidExtractionFixture, withNormalizedSourceRefs } from "../extraction/test-fixtures";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot, REFERENCE_DATE } from "../normalization/test-fixtures";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { runCandidateAnalysis } from "./analyze-candidate";
import type { AiRadarLlmProvider, LlmAnalyzeInput, LlmAnalyzeResult } from "./provider";
import { AI_RADAR_MODEL_ID, AI_RADAR_PROMPT_VERSION } from "./prompt";

const corpus = normalizeCandidateContent({
  candidate_id: "cand_8f2a91",
  normalization_run_id: "norm_run_repair",
  snapshots: [buildRawSnapshot({ external_content_id: "th_99102" })],
  referenceDate: REFERENCE_DATE,
});
const allowedId = corpus.items[0].normalized_content_id;

function conforming(): AiRadarExtractionV1 {
  return withNormalizedSourceRefs(
    { ...buildValidExtractionFixture(), candidate_id: "cand_8f2a91" },
    allowedId,
    "threads",
  );
}

/** Only a second OpenAI call can fix this: reasoning is required by v1. */
function unrepairableByConformance(): AiRadarExtractionV1 {
  const extraction = conforming() as unknown as Record<string, unknown>;
  (extraction.needs as Record<string, unknown>).reasoning = "";
  return extraction as unknown as AiRadarExtractionV1;
}

function providerReturning(results: LlmAnalyzeResult[]): {
  provider: AiRadarLlmProvider;
  calls: LlmAnalyzeInput[];
} {
  const calls: LlmAnalyzeInput[] = [];
  let index = 0;
  return {
    calls,
    provider: {
      analyze: vi.fn(async (input: LlmAnalyzeInput) => {
        calls.push(input);
        const result = results[Math.min(index, results.length - 1)];
        index += 1;
        return result;
      }),
    },
  };
}

function llmResult(extraction: AiRadarExtractionV1, tokens = 1200): LlmAnalyzeResult {
  return {
    extraction,
    model_id: AI_RADAR_MODEL_ID,
    prompt_version: AI_RADAR_PROMPT_VERSION,
    raw_json: JSON.stringify(extraction),
    repaired: false,
    usage: { prompt_tokens: tokens, completion_tokens: 300, total_tokens: tokens + 300 },
  };
}

async function analyze(provider: AiRadarLlmProvider) {
  return runCandidateAnalysis({
    repo: new InMemoryRadarRepository(),
    corpus,
    normalization_run_id: corpus.normalization_run_id,
    provider,
    referenceDate: REFERENCE_DATE,
  });
}

describe("RADAR-SCALE-02 bounded extraction repair", () => {
  it("spends one OpenAI call when the first output already conforms", async () => {
    const { provider } = providerReturning([llmResult(conforming())]);
    const result = await analyze(provider);

    expect(result.kind).toBe("analyzed");
    expect(result.telemetry?.openai_calls).toBe(1);
    expect(result.telemetry?.repair_attempted).toBe(false);
    expect(result.telemetry?.usage?.[0]?.total_tokens).toBe(1500);
  });

  it("repairs deterministically without a second OpenAI call", async () => {
    const extraction = conforming() as unknown as Record<string, unknown>;
    extraction.core_traits = [
      { trait_id: "consistency_resilience", evidence_events: [] },
      { trait_id: "consistency_resilience", evidence_events: [] },
      { trait_id: "sharing_influence", evidence_events: [] },
      { trait_id: "sharing_influence", evidence_events: [] },
    ];

    const { provider } = providerReturning([
      llmResult(extraction as unknown as AiRadarExtractionV1),
    ]);
    const result = await analyze(provider);

    expect(result.kind).toBe("analyzed");
    expect(result.telemetry?.openai_calls).toBe(1);
    expect(result.telemetry?.repair_attempted).toBe(false);
    expect(result.telemetry?.conformance_actions).toContain("core_traits_deduped");
  });

  it("re-asks once with the same evidence and records the repair", async () => {
    const { provider, calls } = providerReturning([
      llmResult(unrepairableByConformance()),
      llmResult(conforming()),
    ]);
    const result = await analyze(provider);

    expect(result.kind).toBe("analyzed");
    expect(result.telemetry?.openai_calls).toBe(2);
    expect(result.telemetry?.repair_attempted).toBe(true);
    expect(result.telemetry?.repair_succeeded).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].repair?.issues.length).toBeGreaterThan(0);
    expect(calls[1].corpus.normalization_run_id).toBe(corpus.normalization_run_id);
    expect(result.telemetry?.usage).toHaveLength(2);
  });

  it("stops at one repair attempt and stays failed", async () => {
    const { provider } = providerReturning([
      llmResult(unrepairableByConformance()),
      llmResult(unrepairableByConformance()),
      llmResult(conforming()),
    ]);
    const result = await analyze(provider);

    expect(result.kind).toBe("failed");
    expect(result.analysis_run.error_code).toBe("SCHEMA_VALIDATION");
    expect(result.telemetry?.openai_calls).toBe(2);
    expect(result.telemetry?.repair_succeeded).toBe(false);
  });

  it("never re-asks after a forbidden score field", async () => {
    const extraction = conforming() as unknown as Record<string, unknown>;
    extraction.overall_score = 91;

    const { provider } = providerReturning([
      llmResult(extraction as unknown as AiRadarExtractionV1),
      llmResult(conforming()),
    ]);
    const result = await analyze(provider);

    expect(result.kind).toBe("failed");
    expect(result.telemetry?.openai_calls).toBe(1);
    expect(result.telemetry?.repair_attempted).toBe(false);
  });
});
