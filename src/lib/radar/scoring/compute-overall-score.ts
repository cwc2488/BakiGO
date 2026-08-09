import { AI_RADAR_SCORING_VERSION } from "./config";
import { computeCoreTraitsScore } from "./core-traits/compute-core-traits-score";
import { computeActivityScore } from "./modules/activity";
import {
  assertChangeWindowCaps,
  computeChangeWindowScore,
} from "./modules/change-window";
import {
  assertContactabilityCaps,
  computeContactabilityScore,
} from "./modules/contactability";
import { computeLocationScore } from "./modules/location";
import { computeNeedsFitScore } from "./modules/needs-fit";
import type { AiRadarExtraction, OverallScoreResult } from "./types";

export function computeOverallScore(
  extraction: AiRadarExtraction,
  referenceDate: Date = new Date(),
): OverallScoreResult {
  const changeWindow = computeChangeWindowScore(extraction.changeWindow);
  assertChangeWindowCaps(changeWindow);

  const needsFit = computeNeedsFitScore(extraction.needs);
  const contactability = computeContactabilityScore(extraction.contactability);
  assertContactabilityCaps(contactability);

  const activity_score = computeActivityScore(extraction.activity);
  const location_score = computeLocationScore(extraction.location);

  const core_traits = computeCoreTraitsScore(
    extraction.coreTraits,
    extraction.profileObservability,
    referenceDate,
  );

  const overall_score =
    changeWindow.change_window_score +
    needsFit.needs_fit_score +
    contactability.contactability_score +
    core_traits.core_traits_score +
    activity_score +
    location_score;

  return {
    scoring_version: AI_RADAR_SCORING_VERSION,
    overall_score,
    components: {
      change_window_score: changeWindow.change_window_score,
      change_intent_score: changeWindow.change_intent_score,
      behavioral_change_score: changeWindow.behavioral_change_score,
      solution_gap_score: changeWindow.solution_gap_score,
      needs_fit_score: needsFit.needs_fit_score,
      contactability_score: contactability.contactability_score,
      natural_entry_score: contactability.natural_entry_score,
      interaction_openness_score: contactability.interaction_openness_score,
      core_traits_score: core_traits.core_traits_score,
      activity_score,
      location_score,
    },
    core_traits,
    needs: extraction.needs,
  };
}
