import { describe, expect, it } from "vitest";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot, REFERENCE_DATE } from "../normalization/test-fixtures";
import { applyExtractionConformance } from "./extraction-conformance";
import { buildValidExtractionFixture, withNormalizedSourceRefs } from "./test-fixtures";
import { validateAiRadarExtraction } from "./validate-ai-radar-extraction";
import type { AiRadarExtractionV1 } from "./schema";

const corpus = normalizeCandidateContent({
  candidate_id: "cand_8f2a91",
  normalization_run_id: "norm_run_conformance",
  snapshots: [buildRawSnapshot({ external_content_id: "th_99102" })],
  referenceDate: REFERENCE_DATE,
});
const allowedId = corpus.items.filter((item) => item.is_analyzable)[0].normalized_content_id;

function baseExtraction(): AiRadarExtractionV1 {
  return withNormalizedSourceRefs(buildValidExtractionFixture(), allowedId, "threads");
}

function conform(input: unknown) {
  const result = applyExtractionConformance(input, { corpus });
  return { ...result, validated: validateAiRadarExtraction(result.data, { corpus }) };
}

describe("RADAR-SCALE-02 deterministic extraction conformance", () => {
  it("leaves a conforming extraction untouched", () => {
    const result = conform(baseExtraction());
    expect(result.actions).toEqual([]);
    expect(result.validated.success).toBe(true);
  });

  it("clamps relevance above the fit-policy ceiling instead of failing", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    (extraction.needs as { items: Array<Record<string, unknown>> }).items = [
      {
        need_id: "income",
        need_type: "income_pressure",
        strength: "clear",
        relevance: "high_fit",
        source_refs: [{ platform: "threads", content_id: allowedId }],
        reasoning: "明確表達財務壓力。",
      },
    ];

    const result = conform(extraction);
    expect(result.actions).toContain("need_relevance_clamped_to_ceiling");
    expect(result.validated.success).toBe(true);
    if (result.validated.success && result.validated.data.needs.availability === "available") {
      expect(result.validated.data.needs.items[0].relevance).toBe("adjacent");
    }
  });

  it("downgrades high_fit to relevant when evidence quality is not direct", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    (extraction.needs as { items: Array<Record<string, unknown>> }).items = [
      {
        need_id: "fitness",
        need_type: "muscle_fitness_performance",
        strength: "clear",
        relevance: "high_fit",
        relevance_evidence_quality: "contextual",
        source_refs: [{ platform: "threads", content_id: allowedId }],
        reasoning: "想提升體能。",
      },
    ];

    const result = conform(extraction);
    expect(result.validated.success).toBe(true);
    if (result.validated.success && result.validated.data.needs.availability === "available") {
      expect(result.validated.data.needs.items[0].relevance).toBe("relevant");
    }
  });

  it("moves the umbrella need out of scored needs into advisory", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    const needs = extraction.needs as { items: Array<Record<string, unknown>> };
    needs.items = [
      ...needs.items,
      {
        need_id: "growth",
        need_type: "personal_growth_life_change",
        strength: "clear",
        relevance: "adjacent",
        source_refs: [{ platform: "threads", content_id: allowedId }],
        reasoning: "想讓生活不一樣。",
      },
    ];

    const result = conform(extraction);
    expect(result.actions).toContain("umbrella_need_moved_to_advisory");
    expect(result.validated.success).toBe(true);
    if (result.validated.success) {
      expect(result.validated.data.advisory?.umbrella_need_tags).toContain(
        "personal_growth_life_change",
      );
      if (result.validated.data.needs.availability === "available") {
        expect(
          result.validated.data.needs.items.some(
            (item) => item.need_type === "personal_growth_life_change",
          ),
        ).toBe(false);
      }
    }
  });

  it("keeps the umbrella need when it is the only detected need", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    (extraction.needs as { items: Array<Record<string, unknown>> }).items = [
      {
        need_id: "growth",
        need_type: "personal_growth_life_change",
        strength: "clear",
        relevance: "adjacent",
        source_refs: [{ platform: "threads", content_id: allowedId }],
        reasoning: "想讓生活不一樣。",
      },
    ];

    const result = conform(extraction);
    expect(result.validated.success).toBe(true);
    if (result.validated.success && result.validated.data.needs.availability === "available") {
      expect(result.validated.data.needs.items).toHaveLength(1);
    }
  });

  it("dedupes duplicated core traits and fills the missing ones with no evidence", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    extraction.core_traits = [
      { trait_id: "consistency_resilience", evidence_events: [] },
      { trait_id: "consistency_resilience", evidence_events: [] },
      { trait_id: "sharing_influence", evidence_events: [] },
      { trait_id: "sharing_influence", evidence_events: [] },
    ];

    const result = conform(extraction);
    expect(result.actions).toContain("core_traits_deduped");
    expect(result.actions).toContain("core_traits_filled");
    expect(result.validated.success).toBe(true);
    if (result.validated.success) {
      const ids = result.validated.data.core_traits.map((trait) => trait.trait_id);
      expect(new Set(ids).size).toBe(4);
      expect(result.validated.data.core_traits.every((trait) =>
        Array.isArray(trait.evidence_events),
      )).toBe(true);
    }
  });

  it("drops invented source refs and downgrades the module that loses all evidence", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    const changeWindow = extraction.change_window as Record<string, Record<string, unknown>>;
    changeWindow.solution_gap = {
      availability: "available",
      level: "active_gap",
      source_refs: [{ platform: "threads", content_id: "9bb357628a2a03d541e8103" }],
      reasoning: "仍在尋找新解法。",
    };

    const result = conform(extraction);
    expect(result.actions).toContain("unknown_source_ref_dropped");
    expect(result.actions).toContain("module_downgraded_to_unknown");
    expect(result.validated.success).toBe(true);
    if (result.validated.success) {
      expect(result.validated.data.change_window.solution_gap.availability).toBe("unknown");
    }
  });

  it("never upgrades a claim: an unknown module stays unknown", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    (extraction.change_window as Record<string, unknown>).change_intent = {
      availability: "unknown",
      reasoning: "公開內容不足。",
    };

    const result = conform(extraction);
    expect(result.validated.success).toBe(true);
    if (result.validated.success) {
      expect(result.validated.data.change_window.change_intent.availability).toBe("unknown");
    }
  });

  it("downgrades an available level none that carries no reviewed evidence", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    (extraction.change_window as Record<string, unknown>).behavioral_change = {
      availability: "available",
      level: "none",
      source_refs: [],
      reasoning: "沒有看到行動。",
    };

    const result = conform(extraction);
    expect(result.actions).toContain("module_downgraded_to_unknown");
    expect(result.validated.success).toBe(true);
  });

  it("downgrades location marked available without a normalized place", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    extraction.location = {
      availability: "available",
      source_refs: [{ platform: "threads", content_id: allowedId }],
      reasoning: "提到在台灣。",
    };

    const result = conform(extraction);
    expect(result.actions).toContain("location_downgraded_to_unknown");
    expect(result.validated.success).toBe(true);
  });

  it("omits a need reported with strength none rather than scoring it", () => {
    const extraction = baseExtraction() as unknown as Record<string, unknown>;
    (extraction.needs as { items: Array<Record<string, unknown>> }).items = [
      {
        need_id: "none",
        need_type: "weight_fat_management",
        strength: "none",
        relevance: "high_fit",
        source_refs: [{ platform: "threads", content_id: allowedId }],
        reasoning: "沒有偵測到需求。",
      },
    ];

    const result = conform(extraction);
    expect(result.actions).toContain("need_item_dropped");
    expect(result.validated.success).toBe(true);
    if (result.validated.success && result.validated.data.needs.availability === "available") {
      expect(result.validated.data.needs.items).toHaveLength(0);
    }
  });

  it("cannot rescue a forbidden score field or an unknown key", () => {
    const forbidden = baseExtraction() as unknown as Record<string, unknown>;
    forbidden.overall_score = 88;
    expect(conform(forbidden).validated.success).toBe(false);

    const unknownKey = baseExtraction() as unknown as Record<string, unknown>;
    unknownKey.total_score = 88;
    expect(conform(unknownKey).validated.success).toBe(false);
  });
});
