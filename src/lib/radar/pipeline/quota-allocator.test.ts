import { describe, expect, it } from "vitest";
import { allocateDailyQuota, DEFAULT_DAILY_QUOTA_BUDGET } from "./quota-allocator";
import type { OrgKeywordEntry } from "../keywords/build-org-keyword-pool";
import type { CandidateRefreshInput } from "./types";

function keywordEntry(normalized_phrase: string, priority = 10): OrgKeywordEntry {
  return {
    normalized_phrase,
    display_phrase: normalized_phrase,
    priority_score: priority,
    attributions: [
      {
        member_id: "member-a",
        keyword_id: `kw-${normalized_phrase}`,
        phrase: normalized_phrase,
        discovery_weight: priority,
      },
    ],
  };
}

function refreshCandidate(candidate_id: string): CandidateRefreshInput {
  return {
    candidate_id,
    lifecycle_state: "active",
    refresh_tier: "standard",
    is_new_candidate: true,
    source_freshness_expired: false,
    is_stale_recovery: false,
    near_top20_competitive: false,
    new_discovery_hit: false,
    force_refresh: false,
    last_enriched_at: null,
    cooling_interval_days: 14,
  };
}

describe("allocateDailyQuota", () => {
  const now = new Date("2026-08-09T03:00:00.000Z");

  it("caps keyword jobs at pool size even when budget is larger", () => {
    const plan = allocateDailyQuota({
      org_keywords: [keywordEntry("a"), keywordEntry("b"), keywordEntry("c")],
      refresh_candidates: [],
      budgets: {
        ...DEFAULT_DAILY_QUOTA_BUDGET,
        keyword_search_daily_budget: 10,
        reserve_capacity_pct: 10,
      },
      now,
    });

    expect(plan.keyword_jobs).toHaveLength(3);
    expect(plan.effective.keyword_search_jobs).toBe(3);
    expect(plan.request_allowance_per_job).toBe(2);
    expect(plan.effective.keyword_search).toBe(6);
    expect(plan.effective.keyword_search_http_budget).toBe(9);
  });

  it("counts keyword_search budget as HTTP requests and excludes blocked phrases", () => {
    const plan = allocateDailyQuota({
      org_keywords: [
        keywordEntry("健身"),
        keywordEntry("減肥"),
        keywordEntry("減脂"),
        keywordEntry("創業"),
      ],
      refresh_candidates: [],
      budgets: {
        ...DEFAULT_DAILY_QUOTA_BUDGET,
        keyword_search_daily_budget: 4,
        reserve_capacity_pct: 0,
        keyword_search_max_page_depth: 2,
      },
      now,
    });

    expect(plan.keyword_jobs.map((job) => job.normalized_phrase)).toEqual(["健身", "創業"]);
    expect(plan.effective.keyword_search_jobs).toBe(2);
    expect(plan.effective.keyword_search).toBe(4);
  });

  it("stops allocating phrase jobs when HTTP budget cannot cover another page-depth slice", () => {
    const plan = allocateDailyQuota({
      org_keywords: [keywordEntry("a"), keywordEntry("b"), keywordEntry("c")],
      refresh_candidates: [],
      budgets: {
        ...DEFAULT_DAILY_QUOTA_BUDGET,
        keyword_search_daily_budget: 3,
        reserve_capacity_pct: 0,
        keyword_search_max_page_depth: 2,
      },
      now,
    });

    expect(plan.keyword_jobs).toHaveLength(1);
    expect(plan.effective.keyword_search).toBe(2);
  });

  it("limits refresh jobs separately from keyword jobs", () => {
    const plan = allocateDailyQuota({
      org_keywords: [],
      refresh_candidates: [
        refreshCandidate("c1"),
        refreshCandidate("c2"),
        refreshCandidate("c3"),
      ],
      budgets: {
        ...DEFAULT_DAILY_QUOTA_BUDGET,
        refresh_enrichment_budget: 2,
        reserve_capacity_pct: 0,
      },
      now,
    });

    expect(plan.refresh_jobs).toHaveLength(2);
  });
});
