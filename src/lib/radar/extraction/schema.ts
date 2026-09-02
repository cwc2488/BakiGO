import { z } from "zod";
import { FIT_POLICY_ID } from "../fit-policy/need-types";
import { NEED_TYPE_SLUGS } from "../fit-policy/need-types";
import {
  HELP_SEEKING_LEVELS,
  MARKET_ROLES,
  NEED_CATEGORIES,
  NEED_OWNERS,
  NEED_STATES,
  PRIMARY_LANGUAGES,
  REGION_CONFIDENCE_LEVELS,
  TRADITIONAL_CHINESE_USABLE,
  URGENCY_LEVELS,
} from "../semantics/candidate-understanding";
import { AI_RADAR_SCORING_VERSION } from "../scoring/config";
import { AI_RADAR_EXTRACTION_SCHEMA_VERSION, CORE_TRAIT_IDS } from "./constants";

export const sourceRefSchema = z.object({
  platform: z.enum(["threads", "instagram"]),
  content_id: z.string().min(1),
  url: z.string().url().optional(),
  fetched_at: z.string().datetime().optional(),
});

export const dataAvailabilitySchema = z.enum(["available", "unknown", "partial"]);

export const CHANGE_INTENT_LEVELS = [
  "none",
  "emerging",
  "clear",
  "strong",
] as const;
export const BEHAVIORAL_CHANGE_LEVELS = [
  "none",
  "exploring",
  "trying",
  "committed_action",
] as const;
export const SOLUTION_GAP_LEVELS = [
  "closed",
  "small",
  "open",
  "active_gap",
] as const;
export const NEED_STRENGTH_LEVELS = [
  "none",
  "emerging",
  "clear",
  "strong",
] as const;
export const NEED_RELEVANCE_LEVELS = [
  "unrelated",
  "adjacent",
  "relevant",
  "high_fit",
] as const;
export const NATURAL_ENTRY_LEVELS = [
  "none",
  "generic",
  "relevant",
  "high_leverage",
] as const;
export const INTERACTION_OPENNESS_LEVELS = [
  "low",
  "limited",
  "open",
  "highly_open",
] as const;

function levelWhenAvailableSchema<L extends readonly [string, ...string[]]>(
  levels: L,
) {
  return z.discriminatedUnion("availability", [
    z
      .object({
        availability: z.literal("available"),
        level: z.enum(levels),
        source_refs: z.array(sourceRefSchema),
        reasoning: z.string().min(1),
      })
      .strict(),
    z
      .object({
        availability: z.literal("unknown"),
        reasoning: z.string().min(1),
        source_refs: z.array(sourceRefSchema).optional(),
      })
      .strict(),
    z
      .object({
        availability: z.literal("partial"),
        reasoning: z.string().min(1),
        source_refs: z.array(sourceRefSchema).optional(),
      })
      .strict(),
  ]);
}

export const changeWindowExtractionSchema = z.object({
  change_intent: levelWhenAvailableSchema(CHANGE_INTENT_LEVELS),
  behavioral_change: levelWhenAvailableSchema(BEHAVIORAL_CHANGE_LEVELS),
  solution_gap: levelWhenAvailableSchema(SOLUTION_GAP_LEVELS),
});

export const needTypeSlugSchema = z.enum(NEED_TYPE_SLUGS);

export const relevanceEvidenceQualitySchema = z.enum([
  "direct",
  "contextual",
  "ambiguous",
]);

export const needItemSchema = z.object({
  need_id: z.string().min(1),
  need_type: needTypeSlugSchema,
  label: z.string().optional(),
  strength: z.enum(NEED_STRENGTH_LEVELS),
  relevance: z.enum(NEED_RELEVANCE_LEVELS),
  relevance_evidence_quality: relevanceEvidenceQualitySchema.optional(),
  source_refs: z.array(sourceRefSchema),
  reasoning: z.string().min(1),
});

export const needsModuleSchema = z.discriminatedUnion("availability", [
  z
    .object({
      availability: z.literal("available"),
      items: z.array(needItemSchema),
      reasoning: z.string().min(1),
    })
    .strict(),
  z
    .object({
      availability: z.literal("unknown"),
      reasoning: z.string().min(1),
      source_refs: z.array(sourceRefSchema).optional(),
    })
    .strict(),
  z
    .object({
      availability: z.literal("partial"),
      reasoning: z.string().min(1),
      source_refs: z.array(sourceRefSchema).optional(),
    })
    .strict(),
]);

const naturalEntrySchema = z.discriminatedUnion("availability", [
  z
    .object({
      availability: z.literal("available"),
      level: z.enum(NATURAL_ENTRY_LEVELS),
      source_refs: z.array(sourceRefSchema),
      reasoning: z.string().min(1),
      topic: z.string().min(1).optional(),
      entry_context: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      availability: z.literal("unknown"),
      reasoning: z.string().min(1),
      source_refs: z.array(sourceRefSchema).optional(),
    })
    .strict(),
  z
    .object({
      availability: z.literal("partial"),
      reasoning: z.string().min(1),
      source_refs: z.array(sourceRefSchema).optional(),
    })
    .strict(),
]);

export const contactabilityExtractionSchema = z.object({
  natural_entry: naturalEntrySchema,
  interaction_openness: levelWhenAvailableSchema(INTERACTION_OPENNESS_LEVELS),
});

export const locationSignalExtractionSchema = z.discriminatedUnion(
  "availability",
  [
    z
      .object({
        availability: z.literal("available"),
        normalized_city: z.string().min(1).optional(),
        normalized_district: z.string().min(1).optional(),
        source_refs: z.array(sourceRefSchema).min(1),
        reasoning: z.string().min(1),
      })
      .strict(),
    z
      .object({
        availability: z.literal("unknown"),
        reasoning: z.string().min(1),
        source_refs: z.array(sourceRefSchema).optional(),
      })
      .strict(),
    z
      .object({
        availability: z.literal("partial"),
        reasoning: z.string().min(1),
        source_refs: z.array(sourceRefSchema).optional(),
      })
      .strict(),
  ],
);

export const evidenceStrengthSchema = z.enum([
  "positive_strong",
  "positive",
  "neutral",
  "contradictory",
  "contradictory_strong",
]);
export const evidenceQualitySchema = z.enum(["direct", "contextual", "ambiguous"]);
export const contextCategorySchema = z.enum([
  "health_fitness",
  "work_career",
  "learning_growth",
  "relationships_social",
  "personal_goals",
  "team_community",
]);

export const traitEvidenceEventSchema = z.object({
  event_id: z.string().min(1),
  story_id: z.string().optional(),
  episode_id: z.string().optional(),
  event_timestamp: z.string().datetime(),
  source_refs: z.array(sourceRefSchema).min(1),
  context_categories: z.array(contextCategorySchema).min(1),
  evidence_strength: evidenceStrengthSchema,
  evidence_quality: evidenceQualitySchema,
  strength_reasoning: z.string().min(1),
  quality_reasoning: z.string().min(1),
});

export const coreTraitEvidenceSchema = z.object({
  trait_id: z.enum(CORE_TRAIT_IDS),
  evidence_events: z.array(traitEvidenceEventSchema),
});

export const candidateIntelligenceAdvisorySchema = z.object({
  primary_need_id: z.string().optional(),
  umbrella_need_tags: z.array(needTypeSlugSchema).optional(),
  why_now_summary: z.array(z.string()).optional(),
  recommendation_reasons: z.array(z.string()).optional(),
});

export const candidateUnderstandingExtractionSchema = z
  .object({
    need_owner: z.enum(NEED_OWNERS),
    need_state: z.enum(NEED_STATES),
    market_role: z.enum(MARKET_ROLES),
    need_category: z.enum(NEED_CATEGORIES),
    pain_points: z.array(z.string()),
    attempts: z.array(z.string()),
    unresolved_gap: z.string().nullable(),
    urgency: z.enum(URGENCY_LEVELS),
    help_seeking: z.enum(HELP_SEEKING_LEVELS),
    evidence_confidence: z.number().min(0).max(1),
    primary_language: z.enum(PRIMARY_LANGUAGES),
    traditional_chinese_usable: z.enum(TRADITIONAL_CHINESE_USABLE),
    candidate_region: z
      .object({
        city: z.string().nullable(),
        district: z.string().nullable(),
      })
      .nullable(),
    region_confidence: z.enum(REGION_CONFIDENCE_LEVELS),
    region_evidence: z.string().nullable(),
    recommendation_reason_zh: z.string().nullable(),
    source_refs: z.array(sourceRefSchema),
  })
  .strict();

export const aiRadarExtractionV1Schema = z
  .object({
    extraction_schema_version: z.literal(AI_RADAR_EXTRACTION_SCHEMA_VERSION),
    scoring_policy_version: z.literal(AI_RADAR_SCORING_VERSION),
    fit_policy_version: z.literal(FIT_POLICY_ID),
    candidate_id: z.string().min(1),
    analysis_run_id: z.string().min(1),
    analyzed_at: z.string().datetime(),
    analysis_window_days: z.literal(90),
    change_window: changeWindowExtractionSchema,
    needs: needsModuleSchema,
    contactability: contactabilityExtractionSchema,
    location: locationSignalExtractionSchema,
    core_traits: z.array(coreTraitEvidenceSchema).length(4),
    advisory: candidateIntelligenceAdvisorySchema.optional(),
    candidate_understanding: candidateUnderstandingExtractionSchema.optional(),
    model_id: z.string().optional(),
    prompt_version: z.string().optional(),
  })
  .strict();

export type AiRadarExtractionV1 = z.infer<typeof aiRadarExtractionV1Schema>;
