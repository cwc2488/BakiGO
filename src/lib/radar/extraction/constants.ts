export const AI_RADAR_EXTRACTION_SCHEMA_VERSION = "v1" as const;

export const CORE_TRAIT_IDS = [
  "consistency_resilience",
  "responsibility_commitment",
  "team_collaboration",
  "sharing_influence",
] as const;

export const FORBIDDEN_AI_SCORE_KEYS = [
  "overall_score",
  "change_window_score",
  "needs_fit_score",
  "contactability_score",
  "core_traits_score",
  "activity_score",
  "location_score",
  "trait_level",
  "trait_confidence",
  "profile_observability_level",
  "rank",
  "recommendation_score",
  "suggested_opening",
  // Pipeline-owned — must not appear on LLM extraction output
  "activity",
  "profile_observability",
  "last_meaningful_activity_at",
  "analyzable_items",
  "analyzable_item_count",
] as const;
