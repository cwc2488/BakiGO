import type { AiRadarExtractionV1 } from "./schema";

/** Normalized content id fixture aligned with normalization test corpus. */
export const FIXTURE_NORMALIZED_CONTENT_ID = "norm_body_comp_001";

const sourceRef = {
  platform: "threads" as const,
  content_id: FIXTURE_NORMALIZED_CONTENT_ID,
};

export function withNormalizedSourceRefs(
  extraction: AiRadarExtractionV1,
  normalizedContentId: string,
  platform: "threads" | "instagram" = "threads",
): AiRadarExtractionV1 {
  const ref = { platform, content_id: normalizedContentId };
  const patchRefs = <T extends { source_refs?: typeof ref[] }>(section: T): T => ({
    ...section,
    source_refs: [ref],
  });

  return {
    ...extraction,
    change_window: {
      change_intent:
        extraction.change_window.change_intent.availability === "available"
          ? patchRefs(extraction.change_window.change_intent)
          : extraction.change_window.change_intent,
      behavioral_change:
        extraction.change_window.behavioral_change.availability === "available"
          ? patchRefs(extraction.change_window.behavioral_change)
          : extraction.change_window.behavioral_change,
      solution_gap:
        extraction.change_window.solution_gap.availability === "available"
          ? patchRefs(extraction.change_window.solution_gap)
          : extraction.change_window.solution_gap,
    },
    needs:
      extraction.needs.availability === "available"
        ? {
            ...extraction.needs,
            items: extraction.needs.items.map((item) => ({
              ...item,
              source_refs: [ref],
            })),
          }
        : extraction.needs,
    contactability: {
      natural_entry:
        extraction.contactability.natural_entry.availability === "available"
          ? patchRefs(extraction.contactability.natural_entry)
          : extraction.contactability.natural_entry,
      interaction_openness:
        extraction.contactability.interaction_openness.availability === "available"
          ? patchRefs(extraction.contactability.interaction_openness)
          : extraction.contactability.interaction_openness,
    },
    location:
      extraction.location.availability === "available"
        ? patchRefs(extraction.location)
        : extraction.location,
    core_traits: extraction.core_traits.map((trait) => ({
      ...trait,
      evidence_events: trait.evidence_events.map((event) => ({
        ...event,
        source_refs: [ref],
      })),
    })),
  };
}

export function buildValidExtractionFixture(
  overrides: Partial<AiRadarExtractionV1> = {},
): AiRadarExtractionV1 {
  return {
    extraction_schema_version: "v1",
    scoring_policy_version: "v1",
    fit_policy_version: "fit_policy_v1",
    candidate_id: "cand_8f2a91",
    analysis_run_id: "run_20260809_001",
    analyzed_at: "2026-08-09T03:15:00.000Z",
    analysis_window_days: 90,
    change_window: {
      change_intent: {
        availability: "available",
        level: "strong",
        source_refs: [sourceRef],
        reasoning: "近期反覆表達具體改變意圖。",
      },
      behavioral_change: {
        availability: "available",
        level: "trying",
        source_refs: [sourceRef],
        reasoning: "已開始實際嘗試。",
      },
      solution_gap: {
        availability: "available",
        level: "active_gap",
        source_refs: [sourceRef],
        reasoning: "仍在尋找新解法。",
      },
    },
    needs: {
      availability: "available",
      items: [
        {
          need_id: "body_composition",
          need_type: "body_composition_change",
          strength: "strong",
          relevance: "high_fit",
          source_refs: [sourceRef],
          reasoning: "明確想改善體態，且已造成困擾。",
        },
      ],
      reasoning: "偵測到一項主要需求。",
    },
    contactability: {
      natural_entry: {
        availability: "available",
        level: "high_leverage",
        source_refs: [sourceRef],
        reasoning: "切入點與需求直接相關。",
        topic: "體態調整進度",
        entry_context: "對方剛分享本週運動與飲食記錄",
      },
      interaction_openness: {
        availability: "available",
        level: "open",
        source_refs: [sourceRef],
        reasoning: "近期有回覆留言。",
      },
    },
    location: {
      availability: "available",
      normalized_city: "新北市",
      normalized_district: "板橋區",
      source_refs: [sourceRef],
      reasoning: "公開檔案可靠標示居住區域。",
    },
    core_traits: [
      {
        trait_id: "consistency_resilience",
        evidence_events: [],
      },
      {
        trait_id: "responsibility_commitment",
        evidence_events: [],
      },
      {
        trait_id: "team_collaboration",
        evidence_events: [],
      },
      {
        trait_id: "sharing_influence",
        evidence_events: [],
      },
    ],
    ...overrides,
  };
}
