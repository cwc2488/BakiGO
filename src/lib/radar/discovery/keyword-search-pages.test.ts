import { describe, expect, it } from "vitest";
import { createDiscoveryRequestBudget } from "./discovery-request-budget";
import {
  classifyKeywordSearchFailure,
  collectKeywordSearchPages,
  extractKeywordSearchCursor,
} from "./keyword-search-pages";

describe("extractKeywordSearchCursor", () => {
  it("prefers paging.cursors.after", () => {
    expect(
      extractKeywordSearchCursor({
        paging: { cursors: { after: "CURSOR_A" }, next: "https://graph.threads.net/v1.0/keyword_search?after=OTHER" },
      }),
    ).toBe("CURSOR_A");
  });

  it("falls back to after= on paging.next and ignores a bare URL", () => {
    expect(
      extractKeywordSearchCursor({
        paging: { next: "https://graph.threads.net/v1.0/keyword_search?after=FROM_URL" },
      }),
    ).toBe("FROM_URL");
    expect(extractKeywordSearchCursor({ paging: { next: "https://evil.example/steal" } })).toBeNull();
    expect(extractKeywordSearchCursor({ data: [] })).toBeNull();
  });
});

describe("collectKeywordSearchPages", () => {
  it("does not call Meta for blocked phrases", async () => {
    let calls = 0;
    const budget = createDiscoveryRequestBudget(5);
    const result = await collectKeywordSearchPages({
      phrase: "減脂",
      budget,
      maxPageDepth: 3,
      fetchPage: async () => {
        calls += 1;
        return { items: [{ id: "x" }], next_cursor: "MORE" };
      },
    });
    expect(calls).toBe(0);
    expect(budget.consumed).toBe(0);
    expect(result).toMatchObject({
      http_requests: 0,
      pages_reached: 0,
      stop_reason: "blocked_phrase",
      paging_followed: false,
    });
  });

  it("follows paging.next until no cursor, one request per page", async () => {
    const seen: Array<{ after: string | null; page: number }> = [];
    const budget = createDiscoveryRequestBudget(5);
    const result = await collectKeywordSearchPages({
      phrase: "健身",
      budget,
      maxPageDepth: 3,
      fetchPage: async ({ after, page }) => {
        seen.push({ after, page });
        if (page === 1) return { items: [{ id: "p1" }], next_cursor: "PAGE2" };
        return { items: [{ id: "p2" }], next_cursor: null };
      },
    });
    expect(seen).toEqual([
      { after: null, page: 1 },
      { after: "PAGE2", page: 2 },
    ]);
    expect(result.http_requests).toBe(2);
    expect(result.pages_reached).toBe(2);
    expect(result.paging_followed).toBe(true);
    expect(result.stop_reason).toBe("no_next");
    expect(result.items).toEqual([{ id: "p1" }, { id: "p2" }]);
    expect(budget.consumed).toBe(2);
  });

  it("stops when request budget is exhausted before the next page", async () => {
    const budget = createDiscoveryRequestBudget(1);
    let calls = 0;
    const result = await collectKeywordSearchPages({
      phrase: "健身",
      budget,
      maxPageDepth: 3,
      fetchPage: async () => {
        calls += 1;
        return { items: [{ id: "p1" }], next_cursor: "PAGE2" };
      },
    });
    expect(calls).toBe(1);
    expect(result.http_requests).toBe(1);
    expect(result.stop_reason).toBe("budget_exhausted");
    expect(result.paging_followed).toBe(false);
    expect(budget.consumed).toBe(1);
  });

  it("stops at the page-depth ceiling even when budget and next remain", async () => {
    const budget = createDiscoveryRequestBudget(5);
    let calls = 0;
    const result = await collectKeywordSearchPages({
      phrase: "健身",
      budget,
      maxPageDepth: 1,
      fetchPage: async () => {
        calls += 1;
        return { items: [{ id: "p1" }], next_cursor: "PAGE2" };
      },
    });
    expect(calls).toBe(1);
    expect(result.stop_reason).toBe("max_depth");
    expect(result.http_requests).toBe(1);
    expect(budget.consumed).toBe(1);
  });

  it("does not retry after a capability failure", async () => {
    const budget = createDiscoveryRequestBudget(4);
    let calls = 0;
    const result = await collectKeywordSearchPages({
      phrase: "健身",
      budget,
      maxPageDepth: 3,
      fetchPage: async () => {
        calls += 1;
        throw new Error("An unexpected error has occurred. Please retry your request later.");
      },
    });
    expect(calls).toBe(1);
    expect(result.http_requests).toBe(1);
    expect(result.stop_reason).toBe("capability_failure");
    expect(budget.consumed).toBe(1);
  });

  it("classifies rate-limit separately from generic capability failure", () => {
    expect(classifyKeywordSearchFailure({ http_status: 429 })).toBe("rate_limit");
    expect(classifyKeywordSearchFailure({ error: new Error("(#4) Application request limit") })).toBe(
      "rate_limit",
    );
    expect(classifyKeywordSearchFailure({ error: new Error("service unavailable") })).toBe(
      "source_unavailable",
    );
  });
});
