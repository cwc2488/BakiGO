export {
  evaluateQualification,
  evaluateQualifications,
  evaluateQualificationForRank,
  QualificationEvaluator,
} from "./evaluator";
export { buildQualificationContext } from "./build-context";
export type { BuildQualificationContextInput } from "./build-context";
export {
  buildQualificationNextSteps,
  selectActiveQualificationResult,
} from "./build-next-steps";
export type {
  QualificationConditionResult,
  QualificationEvaluationContext,
  QualificationGap,
  QualificationMonthlySnapshot,
  QualificationResult,
} from "./types";

import { DEFAULT_QUALIFICATION_RULES } from "../rules/qualification";
import { evaluateQualification } from "./evaluator";
import type { QualificationEvaluationContext, QualificationResult } from "./types";
import { resolvePromotionRankId } from "../rules/promotion";
import { DEFAULT_PROMOTION_TREE } from "../rules/promotion";

const PROMOTION_RANK_ORDER = DEFAULT_PROMOTION_TREE.order;

function getPromotionRankIndex(rankId: string): number {
  return PROMOTION_RANK_ORDER.indexOf(rankId as (typeof PROMOTION_RANK_ORDER)[number]);
}

function applyRankAchievedOverrides(
  results: QualificationResult[],
  memberRankKey: string,
): QualificationResult[] {
  const memberPromotionRankId = resolvePromotionRankId(memberRankKey);
  if (!memberPromotionRankId) {
    return results;
  }

  const memberRankIndex = getPromotionRankIndex(memberPromotionRankId);
  if (memberRankIndex < 0) {
    return results;
  }

  return results.map((result) => {
    const targetIndex = getPromotionRankIndex(result.targetRankId);
    if (targetIndex < 0 || memberRankIndex < targetIndex) {
      return result;
    }

    return {
      ...result,
      isQualified: true,
      isRuleMissing: false,
      overallProgressPercent: 100,
      gaps: [],
    };
  });
}

/** Hide qualification rules for ranks the member has already reached (incl. registration rank). */
export function filterSupersededQualificationResults(
  results: QualificationResult[],
  memberRankKey: string,
): QualificationResult[] {
  const memberPromotionRankId = resolvePromotionRankId(memberRankKey);
  if (!memberPromotionRankId) {
    return results;
  }

  const memberRankIndex = getPromotionRankIndex(memberPromotionRankId);
  if (memberRankIndex < 0) {
    return results;
  }

  return results.filter((result) => {
    const targetIndex = getPromotionRankIndex(result.targetRankId);
    return targetIndex < 0 || targetIndex > memberRankIndex;
  });
}

export function evaluateAllQualificationRules(
  context: QualificationEvaluationContext,
  config = DEFAULT_QUALIFICATION_RULES,
  memberRankKey?: string,
): QualificationResult[] {
  const results = Object.values(config.rules).map((rule) =>
    evaluateQualification(rule, context),
  );

  if (!memberRankKey) {
    return results;
  }

  const withOverrides = applyRankAchievedOverrides(results, memberRankKey);
  return filterSupersededQualificationResults(withOverrides, memberRankKey);
}
