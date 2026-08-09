export { AI_RADAR_SCORING_VERSION, SCORING_WEIGHTS } from "./config";
export { computeOverallScore } from "./compute-overall-score";
export { computeCoreTraitsScore } from "./core-traits/compute-core-traits-score";
export { computeChangeWindowScore } from "./modules/change-window";
export { computeNeedsFitScore } from "./modules/needs-fit";
export { computeContactabilityScore } from "./modules/contactability";
export { computeActivityScore } from "./modules/activity";
export { computeLocationScore } from "./modules/location";
export { rankCandidates } from "./rank-candidates";
export {
  formatCoreTraitsScoreDisplay,
  formatOverallScoreDisplay,
  roundScoreForDisplay,
} from "./format-display";
export type {
  AiRadarExtraction,
  OverallScoreResult,
  RankedCandidate,
  CoreTraitEvidenceInput,
  TraitEvidenceEventInput,
  NeedAssessment,
  ChangeWindowAssessment,
  ContactabilityAssessment,
} from "./types";
