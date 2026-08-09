import { PROFILE_OBSERVABILITY_THRESHOLDS } from "../config";
import type {
  AnalyzableContentItem,
  ProfileObservabilityLevel,
  ProfileObservabilityResult,
} from "../types";

export function countAnalyzableItems(
  items: AnalyzableContentItem[],
): ProfileObservabilityResult {
  let excluded_repost_count = 0;
  let excluded_duplicate_count = 0;
  let excluded_empty_share_count = 0;
  let excluded_no_expression_count = 0;
  let excluded_unattributable_count = 0;
  let analyzable_item_count = 0;

  const seenIds = new Set<string>();

  for (const item of items) {
    if (!item.isCandidateOriginated) {
      excluded_unattributable_count++;
      continue;
    }
    if (item.isPureRepost) {
      excluded_repost_count++;
      continue;
    }
    if (item.isDuplicate || seenIds.has(item.id)) {
      excluded_duplicate_count++;
      continue;
    }
    if (item.isEmptyShare) {
      excluded_empty_share_count++;
      continue;
    }
    if (item.hasMeaningfulExpression === false) {
      excluded_no_expression_count++;
      continue;
    }
    if (item.isReliablyAttributable === false) {
      excluded_unattributable_count++;
      continue;
    }

    seenIds.add(item.id);
    analyzable_item_count++;
  }

  return {
    analyzable_item_count,
    excluded_repost_count,
    excluded_duplicate_count,
    excluded_empty_share_count,
    excluded_no_expression_count,
    excluded_unattributable_count,
    profile_observability_level: levelFromCount(analyzable_item_count),
  };
}

export function levelFromCount(count: number): ProfileObservabilityLevel {
  if (count <= PROFILE_OBSERVABILITY_THRESHOLDS.lowMax) return "low";
  if (count <= PROFILE_OBSERVABILITY_THRESHOLDS.mediumMax) return "medium";
  return "high";
}
