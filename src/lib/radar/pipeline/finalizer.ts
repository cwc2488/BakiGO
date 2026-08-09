import type { PipelineRunStatus } from "../jobs/constants";
import type { RadarJobRecord } from "../jobs/types";

export type PipelineJobSummary = {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  dead_letter: number;
  terminal: number;
  candidate_scoped_failures: number;
};

export type PipelineFinalizerInput = {
  pipeline_run_id: string;
  status: PipelineRunStatus;
  orchestrator_failed?: boolean;
  job_summary: PipelineJobSummary;
};

/** Deterministic pipeline terminal status from job outcomes. */
export function resolvePipelineTerminalStatus(
  input: PipelineFinalizerInput,
): PipelineRunStatus {
  if (input.orchestrator_failed) {
    return "failed";
  }

  const { job_summary: summary } = input;
  if (summary.total === 0) {
    return "success";
  }

  if (summary.running > 0 || summary.pending > 0) {
    return "running";
  }

  if (summary.candidate_scoped_failures > 0 || summary.dead_letter > 0 || summary.failed > 0) {
    return summary.succeeded > 0 ? "partial_success" : "failed";
  }

  return "success";
}

export function summarizePipelineJobs(jobs: RadarJobRecord[]): PipelineJobSummary {
  const summary: PipelineJobSummary = {
    total: jobs.length,
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead_letter: 0,
    terminal: 0,
    candidate_scoped_failures: 0,
  };

  for (const job of jobs) {
    switch (job.status) {
      case "pending":
        summary.pending++;
        break;
      case "running":
        summary.running++;
        break;
      case "succeeded":
        summary.succeeded++;
        summary.terminal++;
        break;
      case "failed":
        summary.failed++;
        summary.terminal++;
        if (isCandidateScopedJob(job)) summary.candidate_scoped_failures++;
        break;
      case "dead_letter":
        summary.dead_letter++;
        summary.terminal++;
        if (isCandidateScopedJob(job)) summary.candidate_scoped_failures++;
        break;
    }
  }

  return summary;
}

function isCandidateScopedJob(job: RadarJobRecord): boolean {
  return ["discover", "enrich", "normalize", "analyze", "score"].includes(job.job_type);
}

export function isPipelineReadyForFinalization(summary: PipelineJobSummary): boolean {
  if (summary.total === 0) return true;
  return summary.terminal === summary.total;
}
