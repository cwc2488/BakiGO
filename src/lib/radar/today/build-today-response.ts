import { isExcludedFromMemberRecommendations } from "../jobs/constants";
import { roundScoreForDisplay } from "../scoring/format-display";
import type { RankedCandidate } from "../scoring/types";
import type { RadarRepository, Top20SnapshotRecord } from "../repository/types";

export type RadarTodayItem = {
  rank: number;
  candidate_id: string;
  display_name: string | null;
  overall_score: number;
  display_overall_score: number;
  module_breakdown: RankedCandidate["result"]["components"];
  primary_need: { need_id: string; label?: string } | null;
  why_now: string[];
  recommendation_reasons: string[];
  natural_entry: {
    level: string;
    topic: string | null;
  };
  activity: {
    days_since_last_meaningful_activity: number | null;
  };
  location: {
    level: string;
    score: number;
  };
  core_traits: RankedCandidate["result"]["core_traits"];
  data_completeness: "full" | "partial" | null;
  observability: {
    level: string;
    analyzable_item_count: number;
  };
  re_recommendation: {
    is_re_recommendation: boolean;
    reason: string | null;
    trigger: string | null;
  };
};

export type RadarTodayResponse = {
  generated_at: string;
  snapshot_date: string;
  items: RadarTodayItem[];
  immutable_item_count: number;
  effective_item_count: number;
};

function primaryNeedFromResult(result: RankedCandidate["result"]) {
  const sorted = [...result.needs].sort((a, b) => {
    const strengthOrder = { none: 0, emerging: 1, clear: 2, strong: 3 };
    return strengthOrder[b.strength] - strengthOrder[a.strength];
  });
  const top = sorted[0];
  if (!top || top.strength === "none") return null;
  return { need_id: top.needId, label: top.label };
}

export async function buildRadarTodayResponse(input: {
  repo: RadarRepository;
  member_id: string;
  snapshot_date: string;
}): Promise<RadarTodayResponse | null> {
  const snapshot = await input.repo.getMemberDailyTop20(input.member_id, input.snapshot_date);
  if (!snapshot) return null;

  const filtered = await applyReadTimeDevelopmentFilter(input.repo, input.member_id, snapshot);

  return {
    generated_at: snapshot.generated_at,
    snapshot_date: snapshot.snapshot_date,
    immutable_item_count: snapshot.item_count,
    effective_item_count: filtered.length,
    items: filtered.map((entry) => mapTodayItem(entry)),
  };
}

export async function applyReadTimeDevelopmentFilter(
  repo: RadarRepository,
  member_id: string,
  snapshot: Top20SnapshotRecord,
): Promise<RankedCandidate[]> {
  const visible: RankedCandidate[] = [];

  for (const item of snapshot.items) {
    const state = await repo.getMemberCandidateState(member_id, item.candidateId);
    if (
      state &&
      isExcludedFromMemberRecommendations({
        development_state: state.development_state,
        excluded_from_recommendations: state.excluded_from_recommendations,
      })
    ) {
      continue;
    }
    visible.push(item);
  }

  return visible;
}

function mapTodayItem(entry: RankedCandidate): RadarTodayItem {
  const primaryNeed = primaryNeedFromResult(entry.result);
  return {
    rank: entry.rank,
    candidate_id: entry.candidateId,
    display_name: null,
    overall_score: entry.overall_score,
    display_overall_score: entry.display_overall_score,
    module_breakdown: entry.result.components,
    primary_need: primaryNeed,
    why_now: buildWhyNow(entry),
    recommendation_reasons: buildWhyNow(entry),
    natural_entry: {
      level: entry.result.components.natural_entry_score >= 8 ? "high_leverage" : "relevant",
      topic: primaryNeed?.label ?? null,
    },
    activity: {
      days_since_last_meaningful_activity: null,
    },
    location: {
      level: "member_context_neutral",
      score: entry.result.components.location_score,
    },
    core_traits: entry.result.core_traits,
    data_completeness: entry.result.core_traits.profile_observability.data_completeness ?? null,
    observability: {
      level: entry.result.core_traits.profile_observability.profile_observability_level,
      analyzable_item_count: entry.result.core_traits.profile_observability.analyzable_item_count,
    },
    re_recommendation: {
      is_re_recommendation: false,
      reason: null,
      trigger: null,
    },
  };
}

function buildWhyNow(entry: RankedCandidate): string[] {
  const reasons: string[] = [];
  if (entry.result.components.change_window_score >= 20) reasons.push("change_window_elevated");
  if (entry.result.components.needs_fit_score >= 15) reasons.push("strong_need_fit");
  if (entry.result.components.contactability_score >= 12) reasons.push("reachable_contact_window");
  if (reasons.length === 0) reasons.push("daily_rank_snapshot");
  return reasons;
}

export function formatTodayScores(items: RadarTodayItem[]): RadarTodayItem[] {
  return items.map((item) => ({
    ...item,
    display_overall_score: roundScoreForDisplay(item.overall_score),
  }));
}
