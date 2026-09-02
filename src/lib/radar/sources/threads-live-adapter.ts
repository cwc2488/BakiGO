import { createHash } from "node:crypto";
import { sanitizeErrorMessage } from "@/lib/meta-review/sanitize-error";
import {
  fetchKeywordSearchPage,
  fetchProfileLookup,
  fetchProfilePosts,
} from "@/lib/meta-review/threads-client";
import { capabilityStateFromMetaError } from "../acquisition/capability-states";
import { createDiscoveryRequestBudget } from "../discovery/discovery-request-budget";
import {
  collectKeywordSearchPages,
  DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
  type CollectedKeywordSearch,
} from "../discovery/keyword-search-pages";
import { isBlockedMetaPhrase } from "../discovery/phrase-inventory-v1";
import { buildCandidateId, normalizeUsername } from "../intake/resolve-candidate-input";
import type { Platform } from "../normalization/schema";
import {
  readSystemThreadsUsername,
  requireSystemThreadsAccessToken,
} from "./live-mode";
import { THREADS_ADAPTER_VERSION } from "./fixture-adapter";
import type {
  CandidateSourceAdapter,
  DiscoveryHit,
  EnrichResult,
  SourceFetchAuditor,
  SourceFetchContext,
} from "./types";

export type ThreadsKeywordHit = {
  id?: string;
  username?: string;
  text?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  is_reply?: boolean;
};

export type ThreadsPostHit = {
  id?: string;
  username?: string;
  text?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  is_reply?: boolean;
};

export type ThreadsKeywordSearchResult = {
  items: ThreadsKeywordHit[];
  next_cursor?: string | null;
  meta_headers?: Record<string, string>;
  http_status?: number;
};

export type ThreadsLiveClient = {
  keywordSearch(
    accessToken: string,
    keyword: string,
    options?: { after?: string | null },
  ): Promise<ThreadsKeywordSearchResult>;
  profileLookup(accessToken: string, username: string): Promise<Record<string, unknown>>;
  profilePosts(accessToken: string, username: string): Promise<{ items: ThreadsPostHit[] }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function graphItems(payload: unknown): unknown[] {
  const record = asRecord(payload);
  if (!record) return [];
  if (Array.isArray(record.data)) return record.data;
  const nested = asRecord(record.data);
  if (nested && Array.isArray(nested.data)) return nested.data;
  return [];
}

function toKeywordHit(value: unknown): ThreadsKeywordHit | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: asString(record.id) ?? undefined,
    username: asString(record.username) ?? undefined,
    text: asString(record.text) ?? undefined,
    permalink: asString(record.permalink) ?? undefined,
    timestamp: asString(record.timestamp) ?? undefined,
    media_type: asString(record.media_type) ?? undefined,
    is_reply: record.is_reply === true,
  };
}

function toPostHit(value: unknown): ThreadsPostHit | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id: asString(record.id) ?? undefined,
    username: asString(record.username) ?? undefined,
    text: asString(record.text) ?? undefined,
    permalink: asString(record.permalink) ?? undefined,
    timestamp: asString(record.timestamp) ?? undefined,
    media_type: asString(record.media_type) ?? undefined,
    is_reply: record.is_reply === true,
  };
}

function contentTypeForPost(post: ThreadsPostHit): "text_post" | "image_post" | "video_post" | "carousel_post" | "reply" {
  if (post.is_reply) return "reply";
  if (post.media_type === "IMAGE") return "image_post";
  if (post.media_type === "VIDEO") return "video_post";
  if (post.media_type === "CAROUSEL_ALBUM") return "carousel_post";
  return "text_post";
}

function publishedAt(timestamp: string | undefined, fallback: string): string {
  if (!timestamp) return fallback;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

/** Meta serves another account's posts only at or above this follower count. */
export const THREADS_PROFILE_POSTS_FOLLOWER_THRESHOLD = 1000;

function buildProfileBiographySnapshot(input: {
  candidate_id: string;
  username: string;
  profile: Record<string, unknown> | null;
  fetched_at: string;
}): EnrichResult["raw_snapshots"] {
  const biography = input.profile
    ? asString(input.profile.threads_biography) ?? asString(input.profile.biography)
    : null;
  if (!biography) return [];

  return [
    {
      raw_snapshot_id: `raw_${input.candidate_id}_profile`,
      external_content_id: `threads_profile_${input.username}`,
      fetched_at: input.fetched_at,
      adapter_version: THREADS_ADAPTER_VERSION,
      fetch_completeness: "partial",
      payload: {
        published_at: input.fetched_at,
        content_type: "text_post",
        content_relationship: "original",
        text: biography,
        is_authored_by_candidate: true,
        permalink: `https://www.threads.net/@${input.username}`,
      },
    },
  ];
}

function permalinkOrNull(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createOfficialThreadsLiveClient(): ThreadsLiveClient {
  return {
    async keywordSearch(accessToken, keyword, options) {
      const result = await fetchKeywordSearchPage(accessToken, keyword, { after: options?.after });
      return {
        items: graphItems(result.data).map(toKeywordHit).filter((item): item is ThreadsKeywordHit => item !== null),
        next_cursor: result.next_cursor,
        meta_headers: result.meta_headers,
        http_status: result.http_status,
      };
    },
    async profileLookup(accessToken, username) {
      const result = await fetchProfileLookup(accessToken, username);
      return result.profile;
    },
    async profilePosts(accessToken, username) {
      const result = await fetchProfilePosts(accessToken, username);
      return {
        items: graphItems(result.posts).map(toPostHit).filter((item): item is ThreadsPostHit => item !== null),
      };
    },
  };
}

export class LiveThreadsAdapter implements CandidateSourceAdapter {
  readonly id = "threads_meta" as const;
  lastDiscoveryReport: CollectedKeywordSearch | null = null;

  constructor(
    private readonly auditor?: SourceFetchAuditor,
    private readonly client: ThreadsLiveClient = createOfficialThreadsLiveClient(),
    private readonly getAccessToken: () => string = requireSystemThreadsAccessToken,
  ) {}

  private async safeRecord(entry: Parameters<NonNullable<SourceFetchAuditor["record"]>>[0]): Promise<void> {
    try {
      await this.auditor?.record(entry);
    } catch {
      // Audit persistence is best-effort and must not mask Meta success or failure.
    }
  }

  async discoverByKeyword(input: {
    phrase: string;
    member_id: string;
    context: SourceFetchContext;
  }): Promise<DiscoveryHit[]> {
    let accessToken: string;
    try {
      accessToken = this.getAccessToken();
    } catch (error) {
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "keyword_search",
        member_id: input.member_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "failed",
        error_code: "TOKEN_MISSING",
        error_message: sanitizeErrorMessage(
          error instanceof Error ? error.message : "THREADS_ACCESS_TOKEN is absent.",
        ),
        metadata: { phrase: input.phrase, mode: "live" },
      });
      throw error;
    }

    if (isBlockedMetaPhrase(input.phrase)) {
      this.lastDiscoveryReport = {
        phrase: input.phrase,
        items: [],
        pages_reached: 0,
        http_requests: 0,
        stop_reason: "blocked_phrase",
        paging_followed: false,
        pages: [],
      };
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "keyword_search",
        member_id: input.member_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "succeeded",
        metadata: {
          phrase: input.phrase,
          mode: "live",
          stop_reason: "blocked_phrase",
          http_requests: 0,
          pages_reached: 0,
        },
      });
      return [];
    }

    try {
      const budget =
        input.context.discovery_request_budget ??
        createDiscoveryRequestBudget(1);
      const collected = await collectKeywordSearchPages({
        phrase: input.phrase,
        budget,
        maxPageDepth: input.context.keyword_search_max_page_depth ?? DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
        fetchPage: async ({ after }) => {
          const page = await this.client.keywordSearch(accessToken, input.phrase, { after });
          return {
            items: page.items,
            next_cursor: page.next_cursor ?? null,
            http_status: page.http_status,
            meta_headers: page.meta_headers,
          };
        },
      });
      this.lastDiscoveryReport = collected;

      if (
        collected.items.length === 0 &&
        (collected.stop_reason === "capability_failure" ||
          collected.stop_reason === "rate_limit" ||
          collected.stop_reason === "source_unavailable")
      ) {
        throw new Error(collected.error_message ?? `keyword_search ${collected.stop_reason}`);
      }

      const systemUsername = readSystemThreadsUsername()?.toLowerCase() ?? null;
      const hits: DiscoveryHit[] = [];
      const byUsername = new Map<string, DiscoveryHit>();
      const seenPosts = new Set<string>();

      for (const page of collected.pages) {
        for (const raw of page.items) {
          const item = raw as ThreadsKeywordHit;
          if (item.id && seenPosts.has(item.id)) continue;
          if (item.id) seenPosts.add(item.id);

          const username = item.username ? normalizeUsername(item.username) : null;
          if (!username) continue;
          if (systemUsername && username === systemUsername) continue;

          const evidence = item.id
            ? {
                external_content_id: item.id,
                text: item.text ?? null,
                permalink: permalinkOrNull(item.permalink),
                published_at: item.timestamp ? publishedAt(item.timestamp, item.timestamp) : null,
                is_reply: item.is_reply === true,
                matched_phrase: input.phrase,
                acquisition_page: page.page,
              }
            : null;

          const existing = byUsername.get(username);
          if (existing) {
            if (evidence) existing.search_evidence?.push(evidence);
            continue;
          }

          const hit: DiscoveryHit = {
            candidate_id: buildCandidateId("threads", username),
            display_name: username,
            platform: "threads",
            external_user_id: item.id ?? username,
            username,
            profile_url: permalinkOrNull(item.permalink) ?? `https://www.threads.net/@${username}`,
            normalized_username: username,
            search_evidence: evidence ? [evidence] : [],
          };
          byUsername.set(username, hit);
          hits.push(hit);
        }
      }

      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "keyword_search",
        member_id: input.member_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "succeeded",
        metadata: {
          phrase: input.phrase,
          mode: "live",
          result_count: collected.items.length,
          username_count: hits.length,
          search_evidence_count: hits.reduce(
            (total, hit) => total + (hit.search_evidence?.length ?? 0),
            0,
          ),
          http_requests: collected.http_requests,
          pages_reached: collected.pages_reached,
          stop_reason: collected.stop_reason,
          paging_followed: collected.paging_followed,
        },
      });

      return hits;
    } catch (error) {
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "keyword_search failed.",
      );
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "keyword_search",
        member_id: input.member_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "failed",
        error_code: "KEYWORD_SEARCH_FAILED",
        error_message: message,
        metadata: { phrase: input.phrase, mode: "live" },
      });
      throw new Error(message);
    }
  }

  async enrichCandidate(input: {
    candidate_id: string;
    platform: Platform;
    external_user_id?: string | null;
    username?: string | null;
    context: SourceFetchContext;
  }): Promise<EnrichResult> {
    const username = input.username ? normalizeUsername(input.username) : null;
    if (!username) {
      const error = new Error("enrich missing Threads username; refusing fixture fallback.");
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "profile_lookup",
        candidate_id: input.candidate_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "failed",
        error_code: "USERNAME_MISSING",
        error_message: error.message,
        metadata: { mode: "live" },
      });
      throw error;
    }

    const accessToken = this.getAccessToken();
    const fetchedAt = new Date().toISOString();
    const failures: string[] = [];
    let profile: Record<string, unknown> | null = null;
    let posts: ThreadsPostHit[] = [];
    let profilePostsSkipReason: string | null = null;

    try {
      profile = await this.client.profileLookup(accessToken, username);
      // Capability/cost routing only. Follower count is never a quality or
      // scoring signal; it only tells us whether Meta will serve the posts.
      const followerCount = Number(profile.followers_count ?? profile.follower_count);
      if (Number.isFinite(followerCount) && followerCount < THREADS_PROFILE_POSTS_FOLLOWER_THRESHOLD) {
        profilePostsSkipReason = "below_threads_profile_threshold";
      }
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "profile_lookup",
        candidate_id: input.candidate_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "succeeded",
        metadata: {
          mode: "live",
          username,
          profile_posts_skipped: profilePostsSkipReason,
        },
      });
    } catch (error) {
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "profile_lookup failed.",
      );
      failures.push(`profile_lookup: ${message}`);
      if (capabilityStateFromMetaError(message) === "below_threads_profile_threshold") {
        profilePostsSkipReason = "below_threads_profile_threshold";
      }
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "profile_lookup",
        candidate_id: input.candidate_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "failed",
        error_code: "PROFILE_LOOKUP_FAILED",
        error_message: message,
        metadata: {
          mode: "live",
          username,
          profile_posts_skipped: profilePostsSkipReason,
        },
      });
    }

    // Cheap gate: Meta has already told us profile_posts cannot be served for
    // this account, so the request is skipped instead of spent. Keyword-search
    // evidence persisted at discovery keeps the candidate analyzable.
    if (profilePostsSkipReason) {
      return {
        candidate_id: input.candidate_id,
        platform: "threads",
        fetch_completeness: "partial",
        raw_snapshots: buildProfileBiographySnapshot({
          candidate_id: input.candidate_id,
          username,
          profile,
          fetched_at: fetchedAt,
        }),
        profile_semantic_hash: createHash("sha256")
          .update(`${username}:${JSON.stringify(profile ?? {})}:profile_posts_skipped`)
          .digest("hex"),
        capability_state: "below_threads_profile_threshold",
        capability_reason:
          failures.length > 0
            ? failures.join(" | ")
            : "profile_posts skipped: account below Threads profile-post threshold",
      };
    }

    try {
      posts = (await this.client.profilePosts(accessToken, username)).items;
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "profile_posts",
        candidate_id: input.candidate_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: posts.length > 0 ? "succeeded" : "partial",
        metadata: { mode: "live", username, post_count: posts.length },
      });
    } catch (error) {
      const message = sanitizeErrorMessage(
        error instanceof Error ? error.message : "profile_posts failed.",
      );
      failures.push(`profile_posts: ${message}`);
      await this.safeRecord({
        adapter_id: this.id,
        endpoint: "profile_posts",
        candidate_id: input.candidate_id,
        pipeline_run_id: input.context.pipeline_run_id,
        job_id: input.context.job_id,
        status: "failed",
        error_code: "PROFILE_POSTS_FAILED",
        error_message: message,
        metadata: { mode: "live", username },
      });
    }

    if (!profile && posts.length === 0) {
      throw new Error(failures.join(" | ") || "Threads enrich failed.");
    }

    const snapshots: EnrichResult["raw_snapshots"] = buildProfileBiographySnapshot({
      candidate_id: input.candidate_id,
      username,
      profile,
      fetched_at: fetchedAt,
    });

    for (const post of posts) {
      const externalId = post.id ?? `${username}_${snapshots.length}`;
      snapshots.push({
        raw_snapshot_id: `raw_${input.candidate_id}_${externalId}`,
        external_content_id: externalId,
        fetched_at: fetchedAt,
        adapter_version: THREADS_ADAPTER_VERSION,
        fetch_completeness: "full",
        payload: {
          published_at: publishedAt(post.timestamp, fetchedAt),
          content_type: contentTypeForPost(post),
          content_relationship: post.is_reply ? "reply" : "original",
          text: post.text ?? null,
          is_authored_by_candidate: true,
          permalink: permalinkOrNull(post.permalink),
        },
      });
    }

    const hashSource = `${username}:${JSON.stringify(profile ?? {})}:${posts.map((post) => post.id).join(",")}`;
    return {
      candidate_id: input.candidate_id,
      platform: "threads",
      fetch_completeness: failures.length > 0 || snapshots.length === 0 ? "partial" : "full",
      raw_snapshots: snapshots,
      profile_semantic_hash: createHash("sha256").update(hashSource).digest("hex"),
      capability_state: failures.length > 0 ? "partial" : snapshots.length > 0 ? "available" : "partial",
      capability_reason: failures.length > 0 ? failures.join(" | ") : null,
    };
  }
}
