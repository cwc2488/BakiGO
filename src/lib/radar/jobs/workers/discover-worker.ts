import { pipelineJobKey } from "../chain";
import type { RadarJobRecord } from "../types";
import { discoverPlatformsForKeyword } from "../../keywords/map-keyword-to-platforms";
import type { KeywordAttribution } from "../../keywords/build-org-keyword-pool";
import { buildCandidateId, normalizeUsername } from "../../intake/resolve-candidate-input";
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

  const platforms = discoverPlatformsForKeyword(phrase);
  const discoveredCandidateIds: string[] = [];

  for (const platform of platforms) {
    const adapter = ctx.sources.forPlatform(platform);
    const hits = await adapter.discoverByKeyword({
      phrase,
      member_id: attributions[0].member_id,
      context: {
        pipeline_run_id: job.pipeline_run_id,
        job_id: job.id,
        member_id: attributions[0].member_id,
      },
    });

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

  return {
    job_id: job.id,
    status: "succeeded",
    metrics: { discovered_count: discoveredCandidateIds.length },
  };
}
