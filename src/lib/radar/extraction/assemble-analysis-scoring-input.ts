import type { CandidateContentCorpus } from "../normalization";
import type {
  ActivityAssessment,
  AiRadarExtraction,
  ProfileObservabilityInput,
} from "../scoring/types";
import { deriveActivity } from "../normalization/derive-activity";
import { toAnalyzableContentItems } from "../normalization/build-corpus-summary";
import { queryAnalyzableInWindow, buildAnalysisWindow } from "../normalization/query-analysis-window";
import {
  mapExtractionToScoringInput,
  type MapExtractionOptions,
} from "./map-extraction-to-scoring-input";
import type { AiRadarExtractionV1 } from "./schema";

export type AssembleAnalysisScoringInputOptions = MapExtractionOptions & {
  corpus: CandidateContentCorpus;
  referenceDate?: Date;
};

export function deriveActivityAssessment(
  corpus: CandidateContentCorpus,
  referenceDate: Date = new Date(),
): ActivityAssessment {
  const window = buildAnalysisWindow(referenceDate);
  const analyzableInWindow = queryAnalyzableInWindow(corpus.items, window);
  const derived = deriveActivity({
    analyzableItems: analyzableInWindow,
    data_completeness: corpus.data_completeness,
    referenceDate,
  });

  return {
    daysSinceLastMeaningfulActivity: derived.days_since_last_meaningful_activity,
  };
}

export function deriveProfileObservabilityInput(
  corpus: CandidateContentCorpus,
  referenceDate: Date = new Date(),
): ProfileObservabilityInput {
  const window = buildAnalysisWindow(referenceDate);
  const analyzableInWindow = queryAnalyzableInWindow(corpus.items, window);

  return {
    analyzableItems: toAnalyzableContentItems(analyzableInWindow),
    dataCompleteness: corpus.data_completeness,
  };
}

export function assembleAnalysisScoringInput(
  extraction: AiRadarExtractionV1,
  options: AssembleAnalysisScoringInputOptions,
): AiRadarExtraction {
  const referenceDate = options.referenceDate ?? new Date();
  const semantic = mapExtractionToScoringInput(extraction, options);

  return {
    ...semantic,
    activity: deriveActivityAssessment(options.corpus, referenceDate),
    profileObservability: deriveProfileObservabilityInput(
      options.corpus,
      referenceDate,
    ),
  };
}
