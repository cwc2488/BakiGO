import type { RadarJobType } from "./constants";
import type { EnqueueJobInput, RadarJobRecord } from "./types";
import type { RadarJobQueue } from "./queue";

export type JobArtifactRefs = {
  enrich_job_id?: string;
  raw_snapshot_ids?: string[];
  normalization_run_id?: string;
  analysis_run_id?: string;
  baseline_score_snapshot_id?: string;
  upstream_job_id?: string;
};

export type ChainedJobPayload = {
  run_date: string;
  candidate_id?: string;
  member_id?: string;
  artifact_refs: JobArtifactRefs;
  depends_on?: {
    job_id: string;
    job_type: RadarJobType;
    artifact_field: keyof JobArtifactRefs;
  };
  [key: string]: unknown;
};

export function pipelineJobKey(run_date: string, parts: string[]): string {
  return `pipeline:${run_date}:${parts.join(":")}`;
}

export function assertArtifactPresent(
  payload: ChainedJobPayload,
  field: keyof JobArtifactRefs,
): string {
  const value = payload.artifact_refs[field];
  if (!value || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`Missing required artifact ref: ${field}`);
  }
  if (Array.isArray(value)) {
    return value.join(",");
  }
  return value;
}

export function validateUpstreamArtifact(
  job: RadarJobRecord,
  field: keyof JobArtifactRefs,
): string {
  const payload = job.payload as ChainedJobPayload;
  return assertArtifactPresent(payload, field);
}

export async function enqueueChainedJob(
  queue: RadarJobQueue,
  input: EnqueueJobInput & { payload: ChainedJobPayload },
  now = new Date(),
): Promise<{ job: RadarJobRecord; created: boolean }> {
  return queue.enqueue(input, now);
}
