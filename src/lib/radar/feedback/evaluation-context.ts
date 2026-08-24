import { AI_RADAR_PROMPT_VERSION } from "../ai/prompt";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import type { RadarFeedbackEvaluationContext } from "./types";

/** Semantic release tag frozen into feedback rows for future quality reports. */
export const RADAR_FEEDBACK_SEMANTIC_VERSION = "RADAR-SEMANTIC-01" as const;

export function buildRadarFeedbackEvaluationContext(input: {
  pipeline_run_id: string | null;
  overall_score: number | null;
  recommendation_reason_shown: string | null;
  prompt_version: string | null;
  extraction: AiRadarExtractionV1 | null;
  location_level: string | null;
}): RadarFeedbackEvaluationContext {
  const understanding = input.extraction?.candidate_understanding ?? null;
  return {
    pipeline_run_id: input.pipeline_run_id,
    overall_score: input.overall_score,
    recommendation_reason_shown: input.recommendation_reason_shown,
    prompt_version: input.prompt_version ?? AI_RADAR_PROMPT_VERSION,
    semantic_version: RADAR_FEEDBACK_SEMANTIC_VERSION,
    need_owner: understanding?.need_owner ?? null,
    need_state: understanding?.need_state ?? null,
    market_role: understanding?.market_role ?? null,
    need_category: understanding?.need_category ?? null,
    urgency: understanding?.urgency ?? null,
    help_seeking: understanding?.help_seeking ?? null,
    primary_language: understanding?.primary_language ?? null,
    candidate_region: understanding?.candidate_region
      ? {
          city: understanding.candidate_region.city ?? null,
          district: understanding.candidate_region.district ?? null,
        }
      : null,
    location_level: input.location_level,
  };
}
