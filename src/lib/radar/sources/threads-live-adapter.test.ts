import { describe, expect, it, vi } from "vitest";
import { ingestLiveThreadsKeywords } from "../live/ingest-live-threads";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { MetaThreadsAdapter } from "./fixture-adapter";
import { OfficialInstagramAdapter } from "./instagram-official-adapter";
import { shouldUseRadarFixtureAdapters } from "./live-mode";
import { createProductionSourceAdapters } from "./registry";
import { LiveThreadsAdapter, type ThreadsLiveClient } from "./threads-live-adapter";

function createClient(overrides?: Partial<ThreadsLiveClient>): ThreadsLiveClient {
  return {
    async keywordSearch(_token, keyword) {
      if (keyword === "減重") {
        throw new Error("An unexpected error has occurred. Please retry your request later.");
      }
      if (keyword === "coffee") {
        return {
          items: [
            {
              id: "coffee-1",
              username: "coffee_stranger",
              text: "morning coffee",
              permalink: "https://www.threads.net/@coffee_stranger/post/1",
              timestamp: "2026-08-20T00:00:00.000Z",
            },
          ],
        };
      }
      return {
        items: [
          {
            id: "fit-1",
            username: "gym_stranger",
            text: "今天去健身",
            permalink: "https://www.threads.net/@gym_stranger/post/1",
            timestamp: "2026-08-20T00:00:00.000Z",
          },
          {
            id: "fit-2",
            username: "omtcsh",
            text: "system account should be skipped",
            timestamp: "2026-08-20T00:00:00.000Z",
          },
        ],
      };
    },
    async profileLookup(_token, username) {
      return { id: username, username, threads_biography: `${username} bio` };
    },
    async profilePosts(_token, username) {
      return {
        items: [
          {
            id: `${username}-p1`,
            username,
            text: `${username} post`,
            permalink: `https://www.threads.net/@${username}/post/p1`,
            timestamp: "2026-08-20T01:00:00.000Z",
          },
        ],
      };
    },
    ...overrides,
  };
}

describe("RADAR-LIVE-01 live Threads ingest", () => {
  it("uses fixture adapters only in test mode, never as a live fallback", () => {
    expect(shouldUseRadarFixtureAdapters()).toBe(true);
    const testAdapters = createProductionSourceAdapters();
    expect(testAdapters[0]).toBeInstanceOf(MetaThreadsAdapter);

    vi.stubEnv("RADAR_SOURCE_MODE", "live");
    const liveAdapters = createProductionSourceAdapters();
    expect(liveAdapters[0]).toBeInstanceOf(LiveThreadsAdapter);
    expect(liveAdapters[1]).toBeInstanceOf(OfficialInstagramAdapter);
    vi.unstubAllEnvs();
  });

  it("fail-closes discover when the system token is missing instead of inventing fixture hits", async () => {
    const adapter = new LiveThreadsAdapter(undefined, createClient(), () => {
      throw new Error("THREADS_ACCESS_TOKEN is absent; refusing fixture fallback.");
    });

    await expect(
      adapter.discoverByKeyword({
        phrase: "健身",
        member_id: "member-a",
        context: {},
      }),
    ).rejects.toThrow(/THREADS_ACCESS_TOKEN is absent/);
  });

  it("ingests real usernames from keyword_search and continues after a query-specific failure", async () => {
    vi.stubEnv("THREADS_SYSTEM_USERNAME", "omtcsh");
    const repo = new InMemoryRadarRepository();
    const audits: Array<{ endpoint: string; status: string; metadata?: Record<string, unknown> }> = [];
    const adapter = new LiveThreadsAdapter(
      {
        record: async (entry) => {
          audits.push(entry);
        },
      },
      createClient(),
      () => "test-token",
    );

    const result = await ingestLiveThreadsKeywords({
      repo,
      adapter,
      memberId: "member-a",
      keywords: ["健身", "減肥", "減重", "coffee"],
    });

    expect(result.ok).toBe(true);
    const fitness = result.keywords.find((item) => item.keyword === "健身");
    const blocked = result.keywords.find((item) => item.keyword === "減肥");
    const diet = result.keywords.find((item) => item.keyword === "減重");
    const coffee = result.keywords.find((item) => item.keyword === "coffee");

    expect(fitness?.ok).toBe(true);
    expect(fitness?.discovered_usernames).toEqual(["gym_stranger"]);
    expect(blocked?.ok).toBe(true);
    expect(blocked?.blocked).toBe(true);
    expect(blocked?.keyword_search_http_requests).toBe(0);
    expect(diet?.ok).toBe(false);
    expect(diet?.error).toMatch(/unexpected error/i);
    expect(coffee?.ok).toBe(true);
    expect(coffee?.discovered_usernames).toEqual(["coffee_stranger"]);

    const gym = await repo.getCandidate("cand_threads_gym_stranger");
    expect(gym?.normalized_username).toBe("gym_stranger");
    expect(gym?.acquisition_source).toBe("system_discovery");

    const snapshots = [...repo.rawSnapshots.values()].filter(
      (snapshot) => snapshot.candidate_id === "cand_threads_gym_stranger",
    );
    expect(snapshots.length).toBeGreaterThan(0);
    expect(
      snapshots.some((snapshot) => {
        const payload = snapshot.payload;
        return (
          payload &&
          typeof payload === "object" &&
          "text" in payload &&
          String((payload as { text?: unknown }).text ?? "").includes("gym_stranger post")
        );
      }),
    ).toBe(true);

    expect(audits.some((entry) => entry.metadata?.mode === "fixture")).toBe(false);
    expect(audits.some((entry) => entry.endpoint === "keyword_search" && entry.status === "failed")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("does not treat audit persistence failure as a Meta keyword failure", async () => {
    vi.stubEnv("THREADS_SYSTEM_USERNAME", "omtcsh");
    const repo = new InMemoryRadarRepository();
    const adapter = new LiveThreadsAdapter(
      {
        record: async () => {
          throw new Error("Could not find the table 'public.source_fetch_audit_log'");
        },
      },
      createClient(),
      () => "test-token",
    );

    const result = await ingestLiveThreadsKeywords({
      repo,
      adapter,
      keywords: ["健身"],
    });
    expect(result.ok).toBe(true);
    expect(result.keywords[0]?.ok).toBe(true);
    expect(result.keywords[0]?.discovered_usernames).toEqual(["gym_stranger"]);
    vi.unstubAllEnvs();
  });
});

describe("RADAR-FINAL-01 controlled pagination", () => {
  it("follows one paging.next, dedups username/post, and consumes one request per page", async () => {
    const keywordSearch = vi.fn(async (_token: string, _keyword: string, options?: { after?: string | null }) => {
      if (!options?.after) {
        return {
          items: [
            { id: "p1", username: "same_user", text: "page1" },
            { id: "p2", username: "other_user", text: "page1-b" },
          ],
          next_cursor: "PAGE2",
        };
      }
      return {
        items: [
          { id: "p1", username: "same_user", text: "duplicate post" },
          { id: "p3", username: "same_user", text: "page2 extra" },
        ],
        next_cursor: null,
      };
    });
    const adapter = new LiveThreadsAdapter(
      undefined,
      createClient({ keywordSearch }),
      () => "test-token",
    );

    const { createDiscoveryRequestBudget } = await import("../discovery/discovery-request-budget");
    const budget = createDiscoveryRequestBudget(3);
    const hits = await adapter.discoverByKeyword({
      phrase: "健身",
      member_id: "member-a",
      context: {
        discovery_request_budget: budget,
        keyword_search_max_page_depth: 2,
      },
    });

    expect(keywordSearch).toHaveBeenCalledTimes(2);
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.username)).toEqual(["same_user", "other_user"]);
    expect(hits[0]?.search_evidence?.map((item) => item.external_content_id)).toEqual(["p1", "p3"]);
    expect(adapter.lastDiscoveryReport?.stop_reason).toBe("no_next");
    expect(adapter.lastDiscoveryReport?.http_requests).toBe(2);
    expect(budget.consumed).toBe(2);
  });

  it("does not paginate when the request budget is 1", async () => {
    const keywordSearch = vi.fn(async () => ({
      items: [{ id: "p1", username: "a", text: "only" }],
      next_cursor: "PAGE2",
    }));
    const adapter = new LiveThreadsAdapter(undefined, createClient({ keywordSearch }), () => "test-token");
    const { createDiscoveryRequestBudget } = await import("../discovery/discovery-request-budget");
    const budget = createDiscoveryRequestBudget(1);
    await adapter.discoverByKeyword({
      phrase: "健身",
      member_id: "m",
      context: { discovery_request_budget: budget, keyword_search_max_page_depth: 2 },
    });
    expect(keywordSearch).toHaveBeenCalledTimes(1);
    expect(adapter.lastDiscoveryReport?.stop_reason).toBe("budget_exhausted");
  });
});
