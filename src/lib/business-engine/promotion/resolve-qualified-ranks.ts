import { DEFAULT_PROMOTION_TREE, resolvePromotionRankId } from "../rules/promotion";
import type { PromotionRankId, PromotionTree } from "../rules/promotion";
import type { QualificationResult } from "../qualification/types";

export function resolvePromotionQualifiedRankIds(
  memberRankKey: string,
  tree: PromotionTree = DEFAULT_PROMOTION_TREE,
  qualificationResults: QualificationResult[] = [],
): PromotionRankId[] {
  const currentRankId = resolvePromotionRankId(memberRankKey);
  if (!currentRankId) {
    return [];
  }

  const currentIndex = tree.order.indexOf(currentRankId);
  if (currentIndex < 0) {
    return [];
  }

  const rankOrder = tree.order.slice(0, currentIndex + 1);

  qualificationResults.forEach((result) => {
    if (result.isQualified && !rankOrder.includes(result.targetRankId)) {
      rankOrder.push(result.targetRankId);
    }
  });

  return [...new Set(rankOrder)];
}
