import { isBlockedMetaPhrase } from "./phrase-inventory-v1";
import {
  remainingDiscoveryRequests,
  tryConsumeDiscoveryRequest,
  type DiscoveryRequestBudget,
} from "./discovery-request-budget";

/** Conservative V1 default: page 1 + at most one next page. */
export const DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH = 2;

/** Hard ceiling so config cannot create an unbounded loop. */
export const KEYWORD_SEARCH_PAGE_DEPTH_CEILING = 3;

export type KeywordSearchStopReason =
  | "no_next"
  | "max_depth"
  | "budget_exhausted"
  | "blocked_phrase"
  | "capability_failure"
  | "rate_limit"
  | "source_unavailable";

export type KeywordSearchPage = {
  items: unknown[];
  next_cursor: string | null;
  http_status?: number;
  meta_headers?: Record<string, string>;
};

export type KeywordSearchPageFetcher = (input: {
  phrase: string;
  after: string | null;
  page: number;
}) => Promise<KeywordSearchPage>;

export type CollectedKeywordSearchPage = {
  page: number;
  items: unknown[];
  item_count: number;
  consumed_request: boolean;
  next_cursor: string | null;
  meta_headers: Record<string, string>;
};

export type CollectedKeywordSearch = {
  phrase: string;
  items: unknown[];
  pages_reached: number;
  http_requests: number;
  stop_reason: KeywordSearchStopReason;
  paging_followed: boolean;
  pages: CollectedKeywordSearchPage[];
  error_message?: string;
};

export function clampKeywordSearchPageDepth(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH;
  }
  return Math.max(1, Math.min(KEYWORD_SEARCH_PAGE_DEPTH_CEILING, Math.floor(raw)));
}

export function extractKeywordSearchCursor(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  const paging = asRecord(record.paging);
  if (!paging) return null;

  const cursors = asRecord(paging.cursors);
  const after = asString(cursors?.after);
  if (after) return after;

  const next = asString(paging.next);
  if (!next) return null;
  try {
    const url = new URL(next);
    return asString(url.searchParams.get("after"));
  } catch {
    return null;
  }
}

export function classifyKeywordSearchFailure(input: {
  error?: unknown;
  http_status?: number;
}): KeywordSearchStopReason {
  const status = input.http_status;
  const message = input.error instanceof Error ? input.error.message : String(input.error ?? "");
  if (status === 429 || /rate limit|too many requests|#4\b|#17\b|reduce the amount/i.test(message)) {
    return "rate_limit";
  }
  if (status === 503 || /temporarily unavailable|service unavailable|ETIMEDOUT|ECONNRESET/i.test(message)) {
    return "source_unavailable";
  }
  return "capability_failure";
}

/**
 * Bounded keyword_search collector. Every HTTP page must consume budget first.
 * Never follows an arbitrary paging.next URL — only a cursor on the official endpoint.
 */
export async function collectKeywordSearchPages(input: {
  phrase: string;
  budget: DiscoveryRequestBudget;
  maxPageDepth?: number;
  fetchPage: KeywordSearchPageFetcher;
}): Promise<CollectedKeywordSearch> {
  const phrase = input.phrase.trim();
  const maxPageDepth = clampKeywordSearchPageDepth(input.maxPageDepth);
  const pages: CollectedKeywordSearchPage[] = [];
  const items: unknown[] = [];

  if (!phrase) {
    return emptyResult(phrase, "capability_failure");
  }
  if (isBlockedMetaPhrase(phrase)) {
    return emptyResult(phrase, "blocked_phrase");
  }

  let after: string | null = null;

  for (let page = 1; page <= maxPageDepth; page += 1) {
    if (!tryConsumeDiscoveryRequest(input.budget)) {
      return finish(phrase, items, pages, "budget_exhausted");
    }

    try {
      const result = await input.fetchPage({ phrase, after, page });
      const pageItems = Array.isArray(result.items) ? result.items : [];
      items.push(...pageItems);
      after = result.next_cursor?.trim() || null;
      pages.push({
        page,
        items: pageItems,
        item_count: pageItems.length,
        consumed_request: true,
        next_cursor: after,
        meta_headers: result.meta_headers ?? {},
      });

      if (!after) {
        return finish(phrase, items, pages, "no_next");
      }
      if (page >= maxPageDepth) {
        return finish(phrase, items, pages, "max_depth");
      }
      if (remainingDiscoveryRequests(input.budget) <= 0) {
        return finish(phrase, items, pages, "budget_exhausted");
      }
    } catch (error) {
      const httpStatus =
        error && typeof error === "object" && "http_status" in error
          ? Number((error as { http_status?: number }).http_status)
          : undefined;
      pages.push({
        page,
        items: [],
        item_count: 0,
        consumed_request: true,
        next_cursor: null,
        meta_headers: {},
      });
      return {
        ...finish(phrase, items, pages, classifyKeywordSearchFailure({ error, http_status: httpStatus })),
        error_message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return finish(phrase, items, pages, "max_depth");
}

function emptyResult(phrase: string, stop_reason: KeywordSearchStopReason): CollectedKeywordSearch {
  return {
    phrase,
    items: [],
    pages_reached: 0,
    http_requests: 0,
    stop_reason,
    paging_followed: false,
    pages: [],
  };
}

function finish(
  phrase: string,
  items: unknown[],
  pages: CollectedKeywordSearchPage[],
  stop_reason: KeywordSearchStopReason,
): CollectedKeywordSearch {
  return {
    phrase,
    items,
    pages_reached: pages.length,
    http_requests: pages.filter((page) => page.consumed_request).length,
    stop_reason,
    paging_followed: pages.length > 1,
    pages,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
