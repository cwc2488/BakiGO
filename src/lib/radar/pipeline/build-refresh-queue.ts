import type {
  CandidateRefreshInput,
  DiscoveryPlan,
  MemberKeywordPlan,
  RefreshQueueItem,
  RefreshReasonCode,
} from "./types";

const REASON_PRIORITY: Record<RefreshReasonCode, number> = {
  force_refresh: 100,
  new_candidate: 90,
  source_freshness_expired: 80,
  near_top20_competitive: 70,
  new_discovery_hit: 60,
  stale_candidate_recovery: 50,
  cooling_refresh_interval: 20,
};

export function buildAdaptiveRefreshQueue(
  candidates: CandidateRefreshInput[],
  now: Date,
): RefreshQueueItem[] {
  const selected: RefreshQueueItem[] = [];

  for (const candidate of candidates) {
    const reasons = resolveRefreshReasons(candidate, now);
    if (reasons.length === 0) continue;

    const priority = Math.max(...reasons.map((reason) => REASON_PRIORITY[reason]));
    selected.push({
      candidate_id: candidate.candidate_id,
      priority_score: priority + tierBonus(candidate.refresh_tier),
      reason_codes: reasons,
      planned_phases: ["enrich", "normalize"],
    });
  }

  return selected.sort((a, b) => b.priority_score - a.priority_score);
}

function resolveRefreshReasons(
  candidate: CandidateRefreshInput,
  now: Date,
): RefreshReasonCode[] {
  if (candidate.lifecycle_state === "excluded") {
    return [];
  }

  const reasons: RefreshReasonCode[] = [];

  if (candidate.force_refresh) reasons.push("force_refresh");
  if (candidate.is_new_candidate) reasons.push("new_candidate");
  if (candidate.source_freshness_expired) reasons.push("source_freshness_expired");
  if (candidate.is_stale_recovery && candidate.lifecycle_state === "stale") {
    reasons.push("stale_candidate_recovery");
  }
  if (candidate.near_top20_competitive) reasons.push("near_top20_competitive");
  if (candidate.new_discovery_hit) reasons.push("new_discovery_hit");

  if (
    candidate.refresh_tier === "cooling" &&
    candidate.last_enriched_at &&
    daysSince(candidate.last_enriched_at, now) >= candidate.cooling_interval_days
  ) {
    reasons.push("cooling_refresh_interval");
  }

  return reasons;
}

function tierBonus(tier: CandidateRefreshInput["refresh_tier"]): number {
  if (tier === "priority") return 10;
  if (tier === "standard") return 5;
  return 0;
}

function daysSince(isoDate: string, now: Date): number {
  const ms = now.getTime() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function buildFairDiscoveryPlan(input: {
  members: Array<{ member_id: string }>;
  keywords_by_member: Record<
    string,
    Array<{ keyword_id: string; phrase: string; discovery_weight: number }>
  >;
  baseline_quota_per_member: number;
}): DiscoveryPlan[] {
  const plans: DiscoveryPlan[] = [];

  for (const [index, member] of input.members.entries()) {
    const keywords = [...(input.keywords_by_member[member.member_id] ?? [])].sort(
      (a, b) => b.discovery_weight - a.discovery_weight,
    );

    const selected = keywords.slice(0, input.baseline_quota_per_member);
    if (selected.length === 0) continue;

    plans.push({
      member_id: member.member_id,
      keywords: selected.map((keyword, keywordIndex) => ({
        member_id: member.member_id,
        keyword_id: keyword.keyword_id,
        phrase: keyword.phrase,
        discovery_weight: keyword.discovery_weight,
        allocation_order: index * input.baseline_quota_per_member + keywordIndex,
      })),
    });
  }

  return plans;
}

export function interleaveDiscoveryPlansRoundRobin(
  plans: DiscoveryPlan[],
): MemberKeywordPlan[] {
  const maxLen = Math.max(...plans.map((plan) => plan.keywords.length), 0);
  const interleaved: MemberKeywordPlan[] = [];

  for (let round = 0; round < maxLen; round++) {
    for (const plan of plans) {
      const keyword = plan.keywords[round];
      if (keyword) interleaved.push(keyword);
    }
  }

  return interleaved;
}

export function assertNoFullPoolScan(input: {
  pool_size: number;
  candidates_considered: number;
}): void {
  if (input.pool_size > 0 && input.candidates_considered >= input.pool_size) {
    throw new Error("full candidate pool scan forbidden in V1 refresh builder");
  }
}
