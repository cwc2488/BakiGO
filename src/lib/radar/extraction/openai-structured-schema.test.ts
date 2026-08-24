import { describe, expect, it } from "vitest";
import {
  AI_RADAR_EXTRACTION_SCHEMA_VERSION,
  CORE_TRAIT_IDS,
} from "./constants";
import { FIT_POLICY_ID } from "../fit-policy/need-types";
import { AI_RADAR_SCORING_VERSION } from "../scoring/config";
import { buildValidExtractionFixture } from "./test-fixtures";
import { validateAiRadarExtraction } from "./validate-ai-radar-extraction";
import {
  assertOpenAiStrictObjectGraph,
  buildAiRadarExtractionOpenAiJsonSchema,
  omitJsonNulls,
} from "./openai-structured-schema";

describe("OpenAI structured schema from Extraction v1", () => {
  const schema = buildAiRadarExtractionOpenAiJsonSchema();

  it("is a strict object rooted in Extraction Schema v1 literals and enums", () => {
    expect(schema.type).toBe("object");
    assertOpenAiStrictObjectGraph(schema);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.extraction_schema_version.enum).toEqual([AI_RADAR_EXTRACTION_SCHEMA_VERSION]);
    expect(properties.scoring_policy_version.enum).toEqual([AI_RADAR_SCORING_VERSION]);
    expect(properties.fit_policy_version.enum).toEqual([FIT_POLICY_ID]);
    expect(properties.analysis_window_days.enum).toEqual([90]);
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "extraction_schema_version",
        "scoring_policy_version",
        "fit_policy_version",
        "candidate_id",
        "analysis_run_id",
        "analyzed_at",
        "analysis_window_days",
        "change_window",
        "needs",
        "contactability",
        "location",
        "core_traits",
      ]),
    );
    const blob = JSON.stringify(schema);
    expect(blob).not.toContain("skills");
    expect(blob).not.toContain("education");
    expect(blob).not.toContain("work_experience");
    expect(blob).not.toContain("need_assessment");
    expect(blob).toContain(CORE_TRAIT_IDS[0]);
  });

  it("maps OpenAI null optionals back to Zod optional absence without changing schema semantics", () => {
    const withNulls = {
      ...buildValidExtractionFixture(),
      advisory: null,
      model_id: null,
      location: {
        availability: "unknown",
        reasoning: "公開內容沒有可正規化的地區",
        source_refs: null,
      },
    };
    const mapped = omitJsonNulls(withNulls);
    const result = validateAiRadarExtraction(mapped);
    expect(result.success).toBe(true);
  });
});
