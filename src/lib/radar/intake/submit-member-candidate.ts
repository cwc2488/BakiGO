import type { RadarJobQueue } from "../jobs/queue";
import { pipelineJobKey } from "../jobs/chain";
import type { RadarRepository } from "../repository/types";
import {
  buildCandidateId,
  normalizeUsername,
  resolveCandidateInput,
} from "./resolve-candidate-input";

export type SubmitMemberCandidateInput = {
  member_id: string;
  threads?: string | null;
  instagram?: string | null;
  run_date?: string;
  pipeline_run_id?: string | null;
  now?: Date;
};

export type SubmitMemberCandidateResult =
  | {
      ok: true;
      candidate_id: string;
      platform: "threads" | "instagram";
      normalized_username: string;
      identity_resolution: "resolved" | "pending_enrichment";
      reused_existing: boolean;
      enrich_job_id: string | null;
    }
  | { ok: false; error: string };

export async function submitMemberCandidate(
  deps: { repo: RadarRepository; queue: RadarJobQueue },
  input: SubmitMemberCandidateInput,
): Promise<SubmitMemberCandidateResult> {
  const now = input.now ?? new Date();
  const resolved = resolveCandidateInput({
    threads: input.threads,
    instagram: input.instagram,
  });
  if ("error" in resolved) {
    return { ok: false, error: resolved.error };
  }

  const { platform, normalized_username } = resolved;
  const candidate_id = buildCandidateId(platform, normalized_username);
  const existing = await deps.repo.getCandidate(candidate_id);

  await deps.repo.upsertCandidate({
    id: candidate_id,
    display_name: normalized_username,
    primary_platform: platform,
    lifecycle_state: "active",
    normalized_username,
    acquisition_source: "member_provided",
  });

  await deps.repo.recordMemberSubmission({
    member_id: input.member_id,
    candidate_id,
    platform,
    normalized_username,
    raw_input: resolved.raw_input,
    submitted_at: now,
    identity_resolution_result: existing ? "reused_existing" : "created_new",
  });

  await deps.repo.recordDiscovery({
    member_id: input.member_id,
    candidate_id,
    keyword_id: null,
    keyword_phrase: normalized_username,
    pipeline_run_id: input.pipeline_run_id ?? null,
    discovery_source: "member_provided",
    discovered_at: now,
  });

  const run_date = input.run_date ?? now.toISOString().slice(0, 10);
  const { job, created } = await deps.queue.enqueue(
    {
      pipeline_run_id: input.pipeline_run_id ?? null,
      job_type: "enrich",
      idempotency_key: pipelineJobKey(run_date, [
        "intake-enrich",
        candidate_id,
        input.member_id,
      ]),
      payload: {
        run_date,
        candidate_id,
        platform,
        username: normalized_username,
        external_user_id: normalizeUsername(normalized_username),
        enrich_reason: "member_intake",
        artifact_refs: {},
      },
      priority: 95,
    },
    now,
  );

  return {
    ok: true,
    candidate_id,
    platform,
    normalized_username,
    identity_resolution: "pending_enrichment",
    reused_existing: Boolean(existing),
    enrich_job_id: created ? job.id : null,
  };
}
