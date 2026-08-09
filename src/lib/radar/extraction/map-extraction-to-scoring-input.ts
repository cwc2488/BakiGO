import type {
  ChangeIntentLevel,
  ChangeWindowAssessment,
  ContactabilityAssessment,
  CoreTraitEvidenceInput,
  LocationAssessment,
  NeedAssessment,
  TraitEvidenceEventInput,
} from "../scoring/types";
import type { AiRadarExtractionV1 } from "./schema";
import { resolveLocationLevel } from "./resolve-location";

function resolveScoringLevel<L extends string>(
  assessment:
    | { availability: "available"; level: L }
    | { availability: "unknown" | "partial" },
  noneLevel: L,
): L {
  if (assessment.availability !== "available") {
    return noneLevel;
  }
  return assessment.level;
}

function mapChangeWindow(
  changeWindow: AiRadarExtractionV1["change_window"],
): ChangeWindowAssessment {
  return {
    changeIntent: resolveScoringLevel(
      changeWindow.change_intent,
      "none" as ChangeIntentLevel,
    ),
    behavioralChange: resolveScoringLevel(
      changeWindow.behavioral_change,
      "none",
    ) as ChangeWindowAssessment["behavioralChange"],
    solutionGap: resolveScoringLevel(
      changeWindow.solution_gap,
      "closed",
    ) as ChangeWindowAssessment["solutionGap"],
  };
}

function mapNeeds(needs: AiRadarExtractionV1["needs"]): NeedAssessment[] {
  if (needs.availability !== "available") {
    return [];
  }
  return needs.items.map((need) => ({
    needId: need.need_id,
    label: need.label,
    strength: need.strength,
    relevance: need.relevance,
  }));
}

function mapContactability(
  contactability: AiRadarExtractionV1["contactability"],
): ContactabilityAssessment {
  return {
    naturalEntry: resolveScoringLevel(
      contactability.natural_entry,
      "none",
    ) as ContactabilityAssessment["naturalEntry"],
    interactionOpenness: resolveScoringLevel(
      contactability.interaction_openness,
      "low",
    ) as ContactabilityAssessment["interactionOpenness"],
  };
}

function mapLocation(
  location: AiRadarExtractionV1["location"],
  memberLocationContext?: Parameters<typeof resolveLocationLevel>[1],
): LocationAssessment {
  const level = resolveLocationLevel(location, memberLocationContext);
  return { level };
}

function mapCoreTraits(
  coreTraits: AiRadarExtractionV1["core_traits"],
): CoreTraitEvidenceInput[] {
  return coreTraits.map((trait) => ({
    trait_id: trait.trait_id,
    evidence_events: trait.evidence_events.map(
      (event): TraitEvidenceEventInput => ({
        event_id: event.event_id,
        story_id: event.story_id,
        episode_id: event.episode_id,
        event_timestamp: event.event_timestamp,
        context_categories: event.context_categories,
        evidence_strength: event.evidence_strength,
        evidence_quality: event.evidence_quality,
        strength_reasoning: event.strength_reasoning,
        quality_reasoning: event.quality_reasoning,
        evidence_ref: event.source_refs[0]?.content_id,
      }),
    ),
  }));
}

export type MapExtractionOptions = {
  memberLocationContext?: Parameters<typeof resolveLocationLevel>[1];
};

/** Maps LLM semantic extraction only — activity/observability come from normalization pipeline. */
export function mapExtractionToScoringInput(
  extraction: AiRadarExtractionV1,
  options: MapExtractionOptions = {},
): Omit<
  import("../scoring/types").AiRadarExtraction,
  "activity" | "profileObservability"
> {
  return {
    changeWindow: mapChangeWindow(extraction.change_window),
    needs: mapNeeds(extraction.needs),
    contactability: mapContactability(extraction.contactability),
    location: mapLocation(extraction.location, options.memberLocationContext),
    coreTraits: mapCoreTraits(extraction.core_traits),
  };
}
