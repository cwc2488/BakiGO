import { describe, expect, it, vi } from "vitest";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import type { RawContentSnapshot } from "../normalization/schema";
import {
  buildSearchEvidenceSnapshots,
  THREADS_SEARCH_ADAPTER_VERSION,
} from "./search-evidence";
import { LiveThreadsAdapter, type ThreadsLiveClient } from "./threads-live-adapter";
import { THREADS_ADAPTER_VERSION } from "./fixture-adapter";

const REFERENCE_DATE = new Date("2026-08-21T12:00:00.000Z");

function client(overrides: Partial<ThreadsLiveClient> = {}): ThreadsLiveClient {
  return {
    keywordSearch: vi.fn(async () => ({ items: [] })),
    profileLookup: vi.fn(async () => ({})),
    profilePosts: vi.fn(async () => ({ items: [] })),
    ...overrides,
  };
}

describe("RADAR-SCALE-02 keyword-search evidence", () => {
  it("keeps the matched post with its acquisition provenance", () => {
    const snapshots = buildSearchEvidenceSnapshots({
      candidate_id: "cand_threads_someone",
      hits: [
        {
          external_content_id: "th_1",
          text: "想減脂但一直沒開始",
          permalink: "https://www.threads.net/@someone/post/th_1",
          published_at: "2026-08-20T09:00:00.000Z",
          is_reply: false,
          matched_phrase: "減脂",
        },
      ],
      fetched_at: REFERENCE_DATE.toISOString(),
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].adapter_version).toBe(THREADS_SEARCH_ADAPTER_VERSION);
    expect(snapshots[0].adapter_version).not.toBe(THREADS_ADAPTER_VERSION);
    expect(snapshots[0].external_content_id).toBe("th_1");
    expect(snapshots[0].payload.acquisition_source).toBe("keyword_search");
    expect(snapshots[0].payload.acquisition_phrase).toBe("減脂");
    expect(snapshots[0].payload.acquisition_phrase_key).toBeUndefined();
  });

  it("stores phrase inventory provenance without putting it in the post text", () => {
    const snapshots = buildSearchEvidenceSnapshots({
      candidate_id: "cand_threads_someone",
      hits: [
        {
          external_content_id: "th_2",
          text: "薪水真的不夠用",
          permalink: "https://www.threads.net/@someone/post/th_2",
          published_at: "2026-08-20T09:00:00.000Z",
          is_reply: false,
          matched_phrase: "薪水不夠用",
          phrase_key: "fp_salary_not_enough",
          need_family: "money_change",
          phrase_class: "first_person_need",
        },
      ],
      fetched_at: REFERENCE_DATE.toISOString(),
    });

    expect(snapshots[0].payload.text).toBe("薪水真的不夠用");
    expect(snapshots[0].payload.acquisition_phrase_key).toBe("fp_salary_not_enough");
    expect(snapshots[0].payload.acquisition_need_family).toBe("money_change");
    expect(JSON.stringify(snapshots[0].payload.text)).not.toContain("fp_salary_not_enough");
  });

  it("refuses to invent evidence when the search returned no text or id", () => {
    expect(
      buildSearchEvidenceSnapshots({
        candidate_id: "cand_threads_someone",
        hits: [
          {
            external_content_id: "th_1",
            text: "   ",
            permalink: null,
            published_at: null,
            is_reply: false,
            matched_phrase: "減脂",
          },
          {
            external_content_id: "",
            text: "有內容但沒有貼文 id",
            permalink: null,
            published_at: null,
            is_reply: false,
            matched_phrase: "減脂",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("counts a post once when profile_posts later returns the same Threads post", () => {
    const searchSnapshot = buildSearchEvidenceSnapshots({
      candidate_id: "cand_8f2a91",
      hits: [
        {
          external_content_id: "th_shared",
          text: "想改善體態，最近對身型很不滿意。",
          permalink: "https://www.threads.net/@x/post/th_shared",
          published_at: "2026-08-20T09:00:00.000Z",
          is_reply: false,
          matched_phrase: "體態",
        },
      ],
      fetched_at: "2026-08-21T09:00:00.000Z",
    })[0];

    const asRawSnapshot = (
      snapshot: typeof searchSnapshot,
      adapterVersion: string,
      rawId: string,
      fetchedAt: string,
    ): RawContentSnapshot =>
      ({
        raw_snapshot_id: rawId,
        candidate_id: "cand_8f2a91",
        platform: "threads",
        external_content_id: snapshot.external_content_id,
        fetched_at: fetchedAt,
        adapter_version: adapterVersion,
        fetch_completeness: "full",
        payload: snapshot.payload,
      }) as RawContentSnapshot;

    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_dedup",
      snapshots: [
        asRawSnapshot(
          searchSnapshot,
          THREADS_SEARCH_ADAPTER_VERSION,
          searchSnapshot.raw_snapshot_id,
          "2026-08-21T09:00:00.000Z",
        ),
        asRawSnapshot(
          searchSnapshot,
          THREADS_ADAPTER_VERSION,
          "raw_cand_8f2a91_th_shared",
          "2026-08-21T11:00:00.000Z",
        ),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(1);
    expect(corpus.items).toHaveLength(1);
    // The richer profile-post fetch wins as the canonical normalized item.
    expect(corpus.items[0].adapter_version).toBe(THREADS_ADAPTER_VERSION);
    expect(corpus.counts.raw_item_count).toBe(2);
  });

  it("returns search evidence from live keyword discovery", async () => {
    const adapter = new LiveThreadsAdapter(
      undefined,
      client({
        keywordSearch: vi.fn(async () => ({
          items: [
            {
              id: "th_9",
              username: "someone",
              text: "想找副業增加收入",
              permalink: "https://www.threads.net/@someone/post/th_9",
              timestamp: "2026-08-20T09:00:00.000Z",
            },
            {
              id: "th_10",
              username: "someone",
              text: "第二篇也被搜到",
              timestamp: "2026-08-20T10:00:00.000Z",
            },
          ],
        })),
      }),
      () => "token",
    );

    const hits = await adapter.discoverByKeyword({
      phrase: "副業",
      member_id: "member_1",
      context: {},
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].search_evidence).toHaveLength(2);
    expect(hits[0].search_evidence?.[0].matched_phrase).toBe("副業");
  });
});

describe("RADAR-SCALE-02 cheap enrichment gate", () => {
  it("skips profile_posts when Meta says the account is below the threshold", async () => {
    const profilePosts = vi.fn(async () => ({ items: [] }));
    const adapter = new LiveThreadsAdapter(
      undefined,
      client({
        profileLookup: vi.fn(async () => {
          throw new Error(
            "The user must have 1,000 or more followers to be discoverable via this endpoint.",
          );
        }),
        profilePosts,
      }),
      () => "token",
    );

    const result = await adapter.enrichCandidate({
      candidate_id: "cand_threads_small",
      platform: "threads",
      username: "small",
      context: {},
    });

    expect(profilePosts).not.toHaveBeenCalled();
    expect(result.capability_state).toBe("below_threads_profile_threshold");
    expect(result.raw_snapshots).toHaveLength(0);
    expect(result.fetch_completeness).toBe("partial");
  });

  it("skips profile_posts when the lookup itself reports too few followers", async () => {
    const profilePosts = vi.fn(async () => ({ items: [] }));
    const adapter = new LiveThreadsAdapter(
      undefined,
      client({
        profileLookup: vi.fn(async () => ({
          username: "small",
          followers_count: 42,
          threads_biography: "健身愛好者",
        })),
        profilePosts,
      }),
      () => "token",
    );

    const result = await adapter.enrichCandidate({
      candidate_id: "cand_threads_small",
      platform: "threads",
      username: "small",
      context: {},
    });

    expect(profilePosts).not.toHaveBeenCalled();
    expect(result.capability_state).toBe("below_threads_profile_threshold");
    expect(result.raw_snapshots).toHaveLength(1);
  });

  it("still fetches profile_posts for an eligible account", async () => {
    const profilePosts = vi.fn(async () => ({
      items: [{ id: "th_1", text: "今天練腿", timestamp: "2026-08-20T09:00:00.000Z" }],
    }));
    const adapter = new LiveThreadsAdapter(
      undefined,
      client({
        profileLookup: vi.fn(async () => ({ username: "big", followers_count: 5000 })),
        profilePosts,
      }),
      () => "token",
    );

    const result = await adapter.enrichCandidate({
      candidate_id: "cand_threads_big",
      platform: "threads",
      username: "big",
      context: {},
    });

    expect(profilePosts).toHaveBeenCalledTimes(1);
    expect(result.capability_state).toBe("available");
    expect(result.raw_snapshots).toHaveLength(1);
  });
});
