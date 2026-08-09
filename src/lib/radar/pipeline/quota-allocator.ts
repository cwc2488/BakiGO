import type { OrgKeywordEntry } from "../keywords/build-org-keyword-pool";
import type { RefreshQueueItem } from "./types";
import { buildAdaptiveRefreshQueue } from "./build-refresh-queue";
import type { CandidateRefreshInput } from "./types";

export type DailyQuotaBudget = {
  keyword_search_daily_budget: number;
  profile_discovery_daily_budget: number;
  new_candidate_enrichment_budget: number;
  refresh_enrichment_budget: number;
  reserve_capacity_pct: number;
};

export const DEFAULT_DAILY_QUOTA_BUDGET: DailyQuotaBudget = {
  keyword_search_daily_budget: 50,
  profile_discovery_daily_budget: 100,
  new_candidate_enrichment_budget: 30,
  refresh_enrichment_budget: 70,
  reserve_capacity_pct: 10,
};

export type QuotaAllocationPlan = {
  keyword_jobs: OrgKeywordEntry[];
  refresh_jobs: RefreshQueueItem[];
  budgets: DailyQuotaBudget;
  effective: {
    keyword_search: number;
    profile_discovery: number;
    new_candidate_enrichment: number;
    refresh_enrichment: number;
  };
};

function applyReserve(total: number, reservePct: number): number {
  const reserve = Math.ceil((total * reservePct) / 100);
  return Math.max(0, total - reserve);
}

export function allocateDailyQuota(input: {
  org_keywords: OrgKeywordEntry[];
  refresh_candidates: CandidateRefreshInput[];
  budgets: DailyQuotaBudget;
  now: Date;
}): QuotaAllocationPlan {
  const keywordBudget = applyReserve(
    input.budgets.keyword_search_daily_budget,
    input.budgets.reserve_capacity_pct,
  );
  const refreshBudget = applyReserve(
    input.budgets.refresh_enrichment_budget,
    input.budgets.reserve_capacity_pct,
  );

  const keyword_jobs = input.org_keywords.slice(0, keywordBudget);
  const refreshQueue = buildAdaptiveRefreshQueue(input.refresh_candidates, input.now);
  const refresh_jobs = refreshQueue.slice(0, refreshBudget);

  return {
    keyword_jobs,
    refresh_jobs,
    budgets: input.budgets,
    effective: {
      keyword_search: keyword_jobs.length,
      profile_discovery: applyReserve(
        input.budgets.profile_discovery_daily_budget,
        input.budgets.reserve_capacity_pct,
      ),
      new_candidate_enrichment: applyReserve(
        input.budgets.new_candidate_enrichment_budget,
        input.budgets.reserve_capacity_pct,
      ),
      refresh_enrichment: refresh_jobs.length,
    },
  };
}

export function parseDailyQuotaBudget(raw: Record<string, unknown> | null | undefined): DailyQuotaBudget {
  const caps = raw ?? {};
  return {
    keyword_search_daily_budget:
      typeof caps.keyword_search_daily_budget === "number"
        ? caps.keyword_search_daily_budget
        : DEFAULT_DAILY_QUOTA_BUDGET.keyword_search_daily_budget,
    profile_discovery_daily_budget:
      typeof caps.profile_discovery_daily_budget === "number"
        ? caps.profile_discovery_daily_budget
        : DEFAULT_DAILY_QUOTA_BUDGET.profile_discovery_daily_budget,
    new_candidate_enrichment_budget:
      typeof caps.new_candidate_enrichment_budget === "number"
        ? caps.new_candidate_enrichment_budget
        : DEFAULT_DAILY_QUOTA_BUDGET.new_candidate_enrichment_budget,
    refresh_enrichment_budget:
      typeof caps.refresh_enrichment_budget === "number"
        ? caps.refresh_enrichment_budget
        : DEFAULT_DAILY_QUOTA_BUDGET.refresh_enrichment_budget,
    reserve_capacity_pct:
      typeof caps.reserve_capacity_pct === "number"
        ? caps.reserve_capacity_pct
        : DEFAULT_DAILY_QUOTA_BUDGET.reserve_capacity_pct,
  };
}
