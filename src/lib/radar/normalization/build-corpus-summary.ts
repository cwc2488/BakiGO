import { countAnalyzableItems } from "../scoring/core-traits/profile-observability";
import type { AnalyzableContentItem, ProfileObservabilityLevel } from "../scoring/types";
import { deriveActivity } from "./derive-activity";
import type {
  CandidateContentCorpus,
  DataCompleteness,
  ExclusionReason,
  NormalizedContentItem,
  ProfileObservabilityContentItem,
} from "./schema";
import { buildAnalysisWindow, queryAnalyzableInWindow } from "./query-analysis-window";

export type ObservabilityDerivation = {
  analyzable_items: ProfileObservabilityContentItem[];
  analyzableItemsForScoring: AnalyzableContentItem[];
  analyzable_item_count: number;
  observed_profile_observability_level: ProfileObservabilityLevel;
  data_completeness: DataCompleteness;
};

export function toProfileObservabilityContentItems(
  items: NormalizedContentItem[],
): ProfileObservabilityContentItem[] {
  return items.map((item) => ({
    content_id: item.normalized_content_id,
    platform: item.platform,
    published_at: item.published_at,
    is_candidate_originated: true as const,
    has_meaningful_expression: true as const,
  }));
}

export function toAnalyzableContentItems(
  items: NormalizedContentItem[],
): AnalyzableContentItem[] {
  return items.map((item) => ({
    id: item.normalized_content_id,
    timestamp: item.published_at,
    isCandidateOriginated: true,
    hasMeaningfulExpression: true,
    isReliablyAttributable: true,
  }));
}

export function deriveObservability(input: {
  analyzableInWindow: NormalizedContentItem[];
  data_completeness: DataCompleteness;
}): ObservabilityDerivation {
  const analyzable_items = toProfileObservabilityContentItems(input.analyzableInWindow);
  const analyzableItemsForScoring = toAnalyzableContentItems(input.analyzableInWindow);
  const counted = countAnalyzableItems(analyzableItemsForScoring);

  return {
    analyzable_items,
    analyzableItemsForScoring,
    analyzable_item_count: counted.analyzable_item_count,
    observed_profile_observability_level: counted.profile_observability_level,
    data_completeness: input.data_completeness,
  };
}

function countExcludedByReason(
  items: NormalizedContentItem[],
): Partial<Record<ExclusionReason, number>> {
  const counts: Partial<Record<ExclusionReason, number>> = {};
  for (const item of items) {
    if (!item.exclusion_reason) continue;
    counts[item.exclusion_reason] = (counts[item.exclusion_reason] ?? 0) + 1;
  }
  return counts;
}

export function buildCandidateContentCorpus(input: {
  candidate_id: string;
  normalization_run_id: string;
  normalized_at: string;
  data_completeness: DataCompleteness;
  items: NormalizedContentItem[];
  raw_item_count: number;
  referenceDate?: Date;
}): CandidateContentCorpus {
  const window = buildAnalysisWindow(input.referenceDate);
  const analyzableInWindow = queryAnalyzableInWindow(input.items, window);
  const observability = deriveObservability({
    analyzableInWindow,
    data_completeness: input.data_completeness,
  });
  const activity = deriveActivity({
    analyzableItems: analyzableInWindow,
    data_completeness: input.data_completeness,
    referenceDate: input.referenceDate,
  });

  const platforms = [...new Set(input.items.map((item) => item.platform))];

  return {
    candidate_id: input.candidate_id,
    normalization_run_id: input.normalization_run_id,
    normalization_policy_version: "content_normalization_v1",
    normalized_at: input.normalized_at,
    platforms_included: platforms,
    data_completeness: input.data_completeness,
    items: input.items,
    analysis_window_days: window.analysis_window_days,
    window_start_at: window.window_start_at,
    window_end_at: window.window_end_at,
    analyzable_items: observability.analyzable_items,
    last_meaningful_activity_at: activity.last_meaningful_activity_at,
    counts: {
      raw_item_count: input.raw_item_count,
      normalized_item_count: input.items.length,
      analyzable_item_count: observability.analyzable_item_count,
      excluded_by_reason: countExcludedByReason(input.items),
    },
  };
}

export function buildAllowedContentIdSet(corpus: CandidateContentCorpus): Set<string> {
  return new Set(corpus.items.map((item) => item.normalized_content_id));
}

export function resolveContentTrace(input: {
  corpus: CandidateContentCorpus;
  normalized_content_id: string;
}):
  | {
      normalized_content_id: string;
      external_content_id: string;
      platform: NormalizedContentItem["platform"];
      raw_snapshot_id: string;
      permalink: string | null;
    }
  | null {
  const item = input.corpus.items.find(
    (row) => row.normalized_content_id === input.normalized_content_id,
  );
  if (!item) return null;

  return {
    normalized_content_id: item.normalized_content_id,
    external_content_id: item.external_content_id,
    platform: item.platform,
    raw_snapshot_id: item.raw_snapshot_id,
    permalink: item.permalink,
  };
}
