import { isBlockedMetaPhrase } from "../discovery/phrase-inventory-v1";
import {
  clampKeywordSearchPageDepth,
  DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
} from "../discovery/keyword-search-pages";
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
  /** Max keyword_search HTTP pages per phrase. Default 2. */
  keyword_search_max_page_depth: number;
};

export const DEFAULT_DAILY_QUOTA_BUDGET: DailyQuotaBudget = {
  keyword_search_daily_budget: 50,
  profile_discovery_daily_budget: 100,
  new_candidate_enrichment_budget: 30,
  refresh_enrichment_budget: 70,
  reserve_capacity_pct: 10,
  keyword_search_max_page_depth: DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
};

export type QuotaAllocationPlan = {
  keyword_jobs: OrgKeywordEntry[];
  refresh_jobs: RefreshQueueItem[];
  budgets: DailyQuotaBudget;
  request_allowance_per_job: number;
  effective: {
    keyword_search: number;
    keyword_search_http_budget: number;
    keyword_search_jobs: number;
    keyword_search_max_page_depth: number;
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
  const httpBudget = applyReserve(
    input.budgets.keyword_search_daily_budget,
    input.budgets.reserve_capacity_pct,
  );
  const refreshBudget = applyReserve(
    input.budgets.refresh_enrichment_budget,
    input.budgets.reserve_capacity_pct,
  );
  const maxPageDepth = clampKeywordSearchPageDepth(
    input.budgets.keyword_search_max_page_depth ?? DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
  );
  const eligibleKeywords = input.org_keywords.filter(
    (keyword) => !isBlockedMetaPhrase(keyword.display_phrase) && !isBlockedMetaPhrase(keyword.normalized_phrase),
  );
  const maxJobs = maxPageDepth > 0 ? Math.floor(httpBudget / maxPageDepth) : 0;
  const keyword_jobs = eligibleKeywords.slice(0, maxJobs);
  const refreshQueue = buildAdaptiveRefreshQueue(input.refresh_candidates, input.now);
  const refresh_jobs = refreshQueue.slice(0, refreshBudget);

  return {
    keyword_jobs,
    refresh_jobs,
    budgets: input.budgets,
    request_allowance_per_job: maxPageDepth,
    effective: {
      keyword_search: keyword_jobs.length * maxPageDepth,
      keyword_search_http_budget: httpBudget,
      keyword_search_jobs: keyword_jobs.length,
      keyword_search_max_page_depth: maxPageDepth,
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
    keyword_search_max_page_depth: clampKeywordSearchPageDepth(
      typeof caps.keyword_search_max_page_depth === "number"
        ? caps.keyword_search_max_page_depth
        : DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
    ),
  };
}
