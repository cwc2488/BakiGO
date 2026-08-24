import type { AiRadarExtractionV1 } from "../extraction/schema";
import { emptyUnderstanding } from "./candidate-understanding";
import type { LanguageClassification } from "./language-eligibility";

export function buildLanguageSkipExtraction(input: {
  candidate_id: string;
  analysis_run_id: string;
  analyzed_at?: string;
  language: LanguageClassification;
}): AiRadarExtractionV1 {
  const understanding = emptyUnderstanding({
    primary_language: input.language.primary_language,
    traditional_chinese_usable: input.language.traditional_chinese_usable,
    evidence_confidence: input.language.confidence === "high" ? 0.9 : 0.5,
    recommendation_reason_zh: null,
  });

  return {
    extraction_schema_version: "v1",
    scoring_policy_version: "v1",
    fit_policy_version: "fit_policy_v1",
    candidate_id: input.candidate_id,
    analysis_run_id: input.analysis_run_id,
    analyzed_at: input.analyzed_at ?? new Date().toISOString(),
    analysis_window_days: 90,
    change_window: {
      change_intent: { availability: "unknown", reasoning: "language-ineligible corpus; analysis skipped" },
      behavioral_change: { availability: "unknown", reasoning: "language-ineligible corpus; analysis skipped" },
      solution_gap: { availability: "unknown", reasoning: "language-ineligible corpus; analysis skipped" },
    },
    needs: { availability: "unknown", reasoning: "language-ineligible corpus; analysis skipped" },
    contactability: {
      natural_entry: { availability: "unknown", reasoning: "language-ineligible corpus; analysis skipped" },
      interaction_openness: { availability: "unknown", reasoning: "language-ineligible corpus; analysis skipped" },
    },
    location: { availability: "unknown", reasoning: "language-ineligible corpus; analysis skipped" },
    core_traits: [
      { trait_id: "consistency_resilience", evidence_events: [] },
      { trait_id: "responsibility_commitment", evidence_events: [] },
      { trait_id: "team_collaboration", evidence_events: [] },
      { trait_id: "sharing_influence", evidence_events: [] },
    ],
    candidate_understanding: {
      ...understanding,
      source_refs: [],
    },
  };
}
