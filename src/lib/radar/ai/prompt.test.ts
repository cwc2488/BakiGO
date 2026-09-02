import { describe, expect, it } from "vitest";
import {
  buildOpenAiExtractionResponseFormat,
  constrainSourceRefContentIds,
} from "../extraction/openai-structured-schema";
import { CORE_TRAIT_IDS } from "../extraction/constants";
import { buildAiRadarSystemPrompt, buildAiRadarUserPrompt } from "./prompt";

describe("AI Radar prompt vs structured output", () => {
  it("does not maintain a second field catalog in the user prompt", () => {
    const prompt = buildAiRadarUserPrompt({
      candidate_id: "cand_threads_kuo.e2323",
      corpus_bundle: { analyzable_items: [] },
      allowed_source_ref_content_ids: [],
    });
    expect(prompt).not.toContain("output_contract");
    expect(prompt).not.toContain("fit_policy_v1");
    expect(prompt).not.toContain("analysis_window_days");
    expect(prompt).not.toContain("core_traits");
  });

  it("asks Chat Completions for strict json_schema from Extraction v1", () => {
    const format = buildOpenAiExtractionResponseFormat();
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.name).toBe("ai_radar_extraction_v1");
    expect(format.json_schema.schema.type).toBe("object");
    expect(format.json_schema.schema.additionalProperties).toBe(false);
  });

  it("states the fit-policy relevance ceilings the validator enforces", () => {
    const system = buildAiRadarSystemPrompt();
    expect(system).toContain("income_pressure: default_relevance=adjacent, max_relevance=adjacent");
    expect(system).toContain("career_dissatisfaction: default_relevance=adjacent, max_relevance=adjacent");
    expect(system).toContain("personal_growth_life_change");
    expect(system).toContain("relevance_evidence_quality=direct");
    for (const traitId of CORE_TRAIT_IDS) {
      expect(system).toContain(traitId);
    }
    expect(system).toContain("allowed_source_ref_content_ids");
    expect(system).toContain("need_owner");
    expect(system).toContain("need_state");
    expect(system).toContain("market_role");
    expect(system).toContain("recommendation_reason_zh");
    expect(system).toContain("SEMANTIC v1.3");
    expect(system).toContain("ACTUAL GAP");
  });

  it("passes the corpus ids the model may cite", () => {
    const prompt = buildAiRadarUserPrompt({
      candidate_id: "cand_threads_a",
      corpus_bundle: { analyzable_items: [] },
      allowed_source_ref_content_ids: ["norm_a", "norm_b"],
    });
    expect(prompt).toContain("allowed_source_ref_content_ids");
    expect(prompt).toContain("norm_a");
  });

  it("carries the repair issues on a bounded second attempt only", () => {
    const first = buildAiRadarUserPrompt({
      candidate_id: "cand_threads_a",
      corpus_bundle: {},
      allowed_source_ref_content_ids: ["norm_a"],
    });
    expect(first).toContain("extract_ai_radar_v1");
    expect(first).not.toContain("previous_attempt_rejected_because");

    const repair = buildAiRadarUserPrompt({
      candidate_id: "cand_threads_a",
      corpus_bundle: {},
      allowed_source_ref_content_ids: ["norm_a"],
      repair: { issues: ["needs.items[0].relevance: exceeds policy ceiling"] },
    });
    expect(repair).toContain("repair_ai_radar_v1");
    expect(repair).toContain("exceeds policy ceiling");
  });
});

describe("source_ref content_id narrowing", () => {
  it("enumerates only the supplied corpus ids", () => {
    const format = buildOpenAiExtractionResponseFormat({
      allowedContentIds: ["norm_1", "norm_2"],
    });
    const serialized = JSON.stringify(format.json_schema.schema);
    expect(serialized).toContain('"enum":["norm_1","norm_2"]');
    // Narrowing only: no other string field gains an enum of content ids.
    expect(serialized.match(/"enum":\["norm_1","norm_2"\]/g)?.length).toBeGreaterThan(0);
  });

  it("leaves the schema untouched when no ids are available", () => {
    const base = buildOpenAiExtractionResponseFormat().json_schema.schema;
    expect(constrainSourceRefContentIds(base, [])).toEqual(base);
  });

  it("does not enumerate ids outside source_refs", () => {
    const narrowed = constrainSourceRefContentIds(
      {
        type: "object",
        additionalProperties: false,
        properties: {
          content_id: { type: "string" },
          source_refs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { content_id: { type: "string" } },
            },
          },
        },
      },
      ["norm_1"],
    );
    const properties = narrowed.properties as Record<string, Record<string, unknown>>;
    expect(properties.content_id.enum).toBeUndefined();
    const refItems = (properties.source_refs.items as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(refItems.content_id.enum).toEqual(["norm_1"]);
  });
});
