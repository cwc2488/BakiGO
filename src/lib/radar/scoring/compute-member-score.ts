import { assembleAnalysisScoringInput } from "../extraction/assemble-analysis-scoring-input";
import { resolveLocationLevel, type MemberLocationContext } from "../extraction/resolve-location";
import { isExcludedFromMemberRecommendations } from "../jobs/constants";
import { computeOverallScore } from "./compute-overall-score";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import type { CandidateContentCorpus } from "../normalization/schema";
import type { MemberDevelopmentArea } from "../repository/types";
import type { OverallScoreResult } from "./types";

export function memberAreasToLocationContext(
  areas: MemberDevelopmentArea[],
): MemberLocationContext | undefined {
  const primary = areas.find((area) => area.area_role === "primary");
  const secondary = areas.filter((area) => area.area_role === "secondary");
  if (!primary && secondary.length === 0) return undefined;
  return {
    primary_city: primary?.normalized_city ?? undefined,
    primary_district: primary?.normalized_district ?? undefined,
    secondary_areas: secondary.map((area) => ({
      city: area.normalized_city ?? undefined,
      district: area.normalized_district ?? undefined,
    })),
  };
}

export function computeMemberOverlayScore(input: {
  extraction: AiRadarExtractionV1;
  corpus: CandidateContentCorpus;
  memberLocationContext?: MemberLocationContext;
  referenceDate?: Date;
}): OverallScoreResult {
  const scoringInput = assembleAnalysisScoringInput(input.extraction, {
    corpus: input.corpus,
    memberLocationContext: input.memberLocationContext,
    referenceDate: input.referenceDate,
  });
  return computeOverallScore(scoringInput, input.referenceDate);
}

export function isCandidateExcludedForMember(input: {
  development_state: import("../jobs/constants").MemberDevelopmentState | null;
  excluded_from_recommendations: boolean;
}): boolean {
  return isExcludedFromMemberRecommendations(input);
}

export function resolveMemberLocationLevel(
  extraction: AiRadarExtractionV1,
  memberLocationContext?: MemberLocationContext,
) {
  return resolveLocationLevel(extraction.location, memberLocationContext);
}
