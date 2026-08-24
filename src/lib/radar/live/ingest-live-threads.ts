import {
  createDiscoveryRequestBudget,
  type DiscoveryRequestBudget,
} from "../discovery/discovery-request-budget";
import {
  DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH,
} from "../discovery/keyword-search-pages";
import { isBlockedMetaPhrase } from "../discovery/phrase-inventory-v1";
import { buildCandidateId, normalizeUsername } from "../intake/resolve-candidate-input";
import type { RadarRepository } from "../repository/types";
import { buildSearchEvidenceSnapshots } from "../sources/search-evidence";
import { LiveThreadsAdapter } from "../sources/threads-live-adapter";
import type { SourceFetchAuditor } from "../sources/types";

export const RADAR_LIVE_DEFAULT_KEYWORDS = ["健身"] as const;
export const RADAR_LIVE_MAX_CANDIDATES_PER_KEYWORD = 5;
/** Hard cap so Preview ingest cannot bypass daily request accounting. */
export const LIVE_INGEST_KEYWORD_SEARCH_HTTP_CAP = 4;

export type LiveKeywordIngestResult = {
  keyword: string;
  ok: boolean;
  error: string | null;
  blocked: boolean;
  keyword_search_http_requests: number;
  pages_reached: number;
  stop_reason: string | null;
  discovered_usernames: string[];
  ingested: Array<{
    candidate_id: string;
    username: string;
    enrich_ok: boolean;
    snapshot_count: number;
    search_evidence_count: number;
    capability_state: string | null;
    enrich_error: string | null;
  }>;
};

export type LiveThreadsIngestResult = {
  ok: boolean;
  keywords: LiveKeywordIngestResult[];
  ingested_candidate_ids: string[];
  keyword_search_http_requests: number;
  request_budget_limit: number;
  request_budget_consumed: number;
};

function auditorFor(repo: RadarRepository): SourceFetchAuditor {
  return {
    record: (entry) => repo.recordSourceFetchAudit(entry),
  };
}

export async function ingestLiveThreadsKeywords(input: {
  repo: RadarRepository;
  keywords?: string[];
  memberId?: string | null;
  adapter?: LiveThreadsAdapter;
  now?: Date;
  maxCandidatesPerKeyword?: number;
  discovery_request_budget?: DiscoveryRequestBudget;
  keyword_search_max_page_depth?: number;
}): Promise<LiveThreadsIngestResult> {
  const now = input.now ?? new Date();
  const keywords = (input.keywords?.length ? input.keywords : [...RADAR_LIVE_DEFAULT_KEYWORDS])
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const maxCandidates = input.maxCandidatesPerKeyword ?? RADAR_LIVE_MAX_CANDIDATES_PER_KEYWORD;
  const adapter = input.adapter ?? new LiveThreadsAdapter(auditorFor(input.repo));
  const maxPageDepth = input.keyword_search_max_page_depth ?? DEFAULT_KEYWORD_SEARCH_MAX_PAGE_DEPTH;
  const budget =
    input.discovery_request_budget ??
    createDiscoveryRequestBudget(
      Math.min(keywords.length * maxPageDepth, LIVE_INGEST_KEYWORD_SEARCH_HTTP_CAP),
    );
  const results: LiveKeywordIngestResult[] = [];
  const ingestedIds: string[] = [];

  for (const keyword of keywords) {
    const keywordResult: LiveKeywordIngestResult = {
      keyword,
      ok: false,
      error: null,
      blocked: isBlockedMetaPhrase(keyword),
      keyword_search_http_requests: 0,
      pages_reached: 0,
      stop_reason: isBlockedMetaPhrase(keyword) ? "blocked_phrase" : null,
      discovered_usernames: [],
      ingested: [],
    };

    if (keywordResult.blocked) {
      keywordResult.ok = true;
      results.push(keywordResult);
      continue;
    }

    try {
      const hits = await adapter.discoverByKeyword({
        phrase: keyword,
        member_id: input.memberId ?? "system",
        context: {
          member_id: input.memberId ?? null,
          discovery_request_budget: budget,
          keyword_search_max_page_depth: maxPageDepth,
        },
      });
      const report = adapter.lastDiscoveryReport;
      keywordResult.keyword_search_http_requests = report?.http_requests ?? 0;
      keywordResult.pages_reached = report?.pages_reached ?? 0;
      keywordResult.stop_reason = report?.stop_reason ?? null;

      const uniqueHits = hits.slice(0, maxCandidates);
      keywordResult.discovered_usernames = uniqueHits
        .map((hit) => hit.username)
        .filter((username): username is string => Boolean(username));

      for (const hit of uniqueHits) {
        const username = hit.username ? normalizeUsername(hit.username) : null;
        if (!username) continue;
        const candidateId = buildCandidateId("threads", username);

        try {
          await input.repo.upsertCandidate({
            id: candidateId,
            display_name: hit.display_name ?? username,
            primary_platform: "threads",
            lifecycle_state: "active",
            normalized_username: username,
            acquisition_source: "system_discovery",
          });
        } catch (error) {
          keywordResult.ingested.push({
            candidate_id: candidateId,
            username,
            enrich_ok: false,
            snapshot_count: 0,
            search_evidence_count: 0,
            capability_state: "source_unavailable",
            enrich_error: error instanceof Error ? error.message : "candidate_pool ingest failed",
          });
          continue;
        }

        // Keyword-search posts are already-returned public evidence: keep them
        // before any enrichment decision so a capability-limited account is not
        // treated as evidence-less.
        let searchEvidenceCount = 0;
        const searchSnapshots = buildSearchEvidenceSnapshots({
          candidate_id: candidateId,
          hits: hit.search_evidence ?? [],
          fetched_at: now.toISOString(),
        });
        if (searchSnapshots.length > 0) {
          try {
            const ids = await input.repo.insertRawSnapshots({
              candidate_id: candidateId,
              platform: "threads",
              snapshots: searchSnapshots,
              pipeline_run_id: null,
              enrich_job_id: null,
            });
            searchEvidenceCount = ids.length;
          } catch {
            // Search evidence is additive; enrichment still proceeds.
          }
        }

        try {
          if (input.memberId) {
            await input.repo.recordDiscovery({
              member_id: input.memberId,
              candidate_id: candidateId,
              keyword_phrase: keyword,
              org_keyword_phrase: keyword,
              discovery_source: "keyword_search",
              discovered_at: now,
            });
            await input.repo.upsertDiscoverySignal({
              candidate_id: candidateId,
              signal_type: "new_discovery_hit",
              expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            });
          }

          const enrich = await adapter.enrichCandidate({
            candidate_id: candidateId,
            platform: "threads",
            external_user_id: hit.external_user_id,
            username,
            context: {},
          });

          const snapshotIds = await input.repo.insertRawSnapshots({
            candidate_id: candidateId,
            platform: "threads",
            snapshots: enrich.raw_snapshots,
            pipeline_run_id: null,
            enrich_job_id: null,
          });

          await input.repo.updateRefreshStateAfterEnrich({
            candidate_id: candidateId,
            succeeded: true,
            fetch_completeness: enrich.fetch_completeness,
            profile_semantic_hash: enrich.profile_semantic_hash,
            enrichment_capability_state: enrich.capability_state ?? "available",
            now,
          });

          keywordResult.ingested.push({
            candidate_id: candidateId,
            username,
            enrich_ok: true,
            snapshot_count: snapshotIds.length,
            search_evidence_count: searchEvidenceCount,
            capability_state: enrich.capability_state ?? "available",
            enrich_error: enrich.capability_reason ?? null,
          });
          ingestedIds.push(candidateId);
        } catch (error) {
          keywordResult.ingested.push({
            candidate_id: candidateId,
            username,
            enrich_ok: false,
            snapshot_count: 0,
            search_evidence_count: searchEvidenceCount,
            capability_state: "source_unavailable",
            enrich_error: error instanceof Error ? error.message : "enrich failed",
          });
          ingestedIds.push(candidateId);
        }
      }

      keywordResult.ok = true;
    } catch (error) {
      keywordResult.ok = false;
      keywordResult.error = error instanceof Error ? error.message : "keyword_search failed";
    }

    results.push(keywordResult);
  }

  return {
    ok: results.some((result) => result.ok),
    keywords: results,
    ingested_candidate_ids: ingestedIds,
    keyword_search_http_requests: budget.consumed,
    request_budget_limit: budget.limit,
    request_budget_consumed: budget.consumed,
  };
}
