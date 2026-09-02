import { pipelineJobKey } from "../chain";
import type { RadarJobRecord } from "../types";
import { createDiscoveryRequestBudget } from "../../discovery/discovery-request-budget";
import {
  DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
} from "../../discovery/keyword-search-pages";
import { isBlockedMetaPhrase } from "../../discovery/phrase-inventory-v1";
import { discoverPlatformsForKeyword } from "../../keywords/map-keyword-to-platforms";
import type { KeywordAttribution } from "../../keywords/build-org-keyword-pool";
import { buildCandidateId, normalizeUsername } from "../../intake/resolve-candidate-input";
import { buildSearchEvidenceSnapshots } from "../../sources/search-evidence";
import { LiveThreadsAdapter } from "../../sources/threads-live-adapter";
import {
  enrichPayload,
  type WorkerContext,
  type WorkerResult,
} from "./dispatch";

type DiscoverPayload = {
  member_id?: string;
  phrase?: string;
  normalized_phrase?: string;
  keyword_id?: string;
  run_date?: string;
  attributions?: KeywordAttribution[];
  keyword_search_request_allowance?: number;
  keyword_search_max_page_depth?: number;
};

export async function runDiscoverWorker(
  ctx: WorkerContext,
  job: RadarJobRecord,
): Promise<WorkerResult> {
  const payload = enrichPayload(job) as DiscoverPayload;
  const phrase = String(payload.phrase ?? "");
  const normalized_phrase = String(payload.normalized_phrase ?? phrase);
  const run_date = String(payload.run_date ?? "");
  const now = ctx.now ?? new Date();

  if (!phrase) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "INVALID_PAYLOAD",
      error_message: "discover job missing phrase",
    };
  }

  const attributions: KeywordAttribution[] =
    payload.attributions ??
    (payload.member_id
      ? [
          {
            member_id: String(payload.member_id),
            keyword_id: String(payload.keyword_id ?? "unknown"),
            phrase,
            discovery_weight: 0,
          },
        ]
      : []);

  if (attributions.length === 0) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "INVALID_PAYLOAD",
      error_message: "discover job missing attributions",
    };
  }

  if (isBlockedMetaPhrase(phrase) || isBlockedMetaPhrase(normalized_phrase)) {
    return {
      job_id: job.id,
      status: "succeeded",
      metrics: {
        discovered_count: 0,
        search_evidence_count: 0,
        keyword_search_http_requests: 0,
        pages_reached: 0,
        stop_reason: "blocked_phrase",
        keyword_failures: [],
      },
    };
  }

  const requestAllowance =
    typeof payload.keyword_search_request_allowance === "number"
      ? Math.max(0, Math.floor(payload.keyword_search_request_allowance))
      : 1;
  const maxPageDepth =
    typeof payload.keyword_search_max_page_depth === "number"
      ? payload.keyword_search_max_page_depth
      : DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH;
  const discoveryBudget = createDiscoveryRequestBudget(requestAllowance);

  const platforms = discoverPlatformsForKeyword(phrase);
  const discoveredCandidateIds: string[] = [];
  const keywordFailures: string[] = [];
  let searchEvidenceCount = 0;

  for (const platform of platforms) {
    const adapter = ctx.sources.forPlatform(platform);
    let hits;
    try {
      hits = await adapter.discoverByKeyword({
        phrase,
        member_id: attributions[0].member_id,
        context: {
          pipeline_run_id: job.pipeline_run_id,
          job_id: job.id,
          member_id: attributions[0].member_id,
          discovery_request_budget: discoveryBudget,
          keyword_search_max_page_depth: maxPageDepth,
        },
      });
    } catch (error) {
      keywordFailures.push(
        `${platform}: ${error instanceof Error ? error.message : "discover failed"}`,
      );
      continue;
    }

    for (const hit of hits) {
      const username = hit.username ?? hit.normalized_username ?? null;
      const normalizedUsername = username ? normalizeUsername(username) : null;
      const candidateId =
        normalizedUsername && hit.platform
          ? buildCandidateId(hit.platform, normalizedUsername)
          : hit.candidate_id;

      await ctx.repo.upsertCandidate({
        id: candidateId,
        display_name: hit.display_name ?? normalizedUsername,
        primary_platform: hit.platform,
        lifecycle_state: "active",
        normalized_username: normalizedUsername,
        acquisition_source: "system_discovery",
      });

      for (const attribution of attributions) {
        await ctx.repo.recordDiscovery({
          member_id: attribution.member_id,
          candidate_id: candidateId,
          keyword_id: attribution.keyword_id,
          keyword_phrase: attribution.phrase,
          org_keyword_phrase: normalized_phrase,
          pipeline_run_id: job.pipeline_run_id,
          discovery_source: "keyword_search",
          discovered_at: now,
        });
      }

      await ctx.repo.upsertDiscoverySignal({
        candidate_id: candidateId,
        signal_type: "new_discovery_hit",
        expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      });

      // Persist the matched public post the search already returned, before any
      // enrichment call decides whether Meta will serve more of this account.
      const searchSnapshots = buildSearchEvidenceSnapshots({
        candidate_id: candidateId,
        hits: hit.search_evidence ?? [],
        fetched_at: now.toISOString(),
      });
      if (searchSnapshots.length > 0) {
        searchEvidenceCount += searchSnapshots.length;
        await ctx.repo.insertRawSnapshots({
          candidate_id: candidateId,
          platform: hit.platform,
          snapshots: searchSnapshots,
          pipeline_run_id: job.pipeline_run_id,
          enrich_job_id: null,
        });
      }

      discoveredCandidateIds.push(candidateId);

      await ctx.queue.enqueue(
        {
          pipeline_run_id: job.pipeline_run_id,
          job_type: "enrich",
          idempotency_key: pipelineJobKey(run_date, ["enrich", candidateId, job.id]),
          payload: {
            run_date,
            candidate_id: candidateId,
            platform: hit.platform,
            external_user_id: hit.external_user_id,
            username: username,
            enrich_reason: "new_discovery",
            artifact_refs: {
              upstream_job_id: job.id,
            },
            depends_on: {
              job_id: job.id,
              job_type: "discover",
              artifact_field: "upstream_job_id",
            },
          },
        },
        now,
      );
    }
  }

  if (keywordFailures.length > 0 && discoveredCandidateIds.length === 0) {
    return {
      job_id: job.id,
      status: "failed",
      error_code: "KEYWORD_SEARCH_FAILED",
      error_message: keywordFailures.join(" | "),
      metrics: { discovered_count: 0, keyword_failures: keywordFailures },
    };
  }

  const liveReport =
    ctx.sources.forPlatform("threads") instanceof LiveThreadsAdapter
      ? (ctx.sources.forPlatform("threads") as LiveThreadsAdapter).lastDiscoveryReport
      : null;

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: {
      discovered_count: discoveredCandidateIds.length,
      search_evidence_count: searchEvidenceCount,
      keyword_search_http_requests: liveReport?.http_requests ?? discoveryBudget.consumed,
      pages_reached: liveReport?.pages_reached ?? null,
      stop_reason: liveReport?.stop_reason ?? null,
      keyword_failures: keywordFailures,
    },
  };
}
