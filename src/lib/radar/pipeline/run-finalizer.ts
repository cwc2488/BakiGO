import type { PipelineRunStatus } from "../jobs/constants";
import type { RadarJobRecord } from "../jobs/types";
import {
  isPipelineReadyForFinalization,
  resolvePipelineTerminalStatus,
  summarizePipelineJobs,
} from "./finalizer";
import type { PipelineStore } from "./store";

export type RunPipelineFinalizerInput = {
  pipeline_run_id: string;
  now?: Date;
  orchestrator_failed?: boolean;
};

export type PipelineFinalizerResult = {
  pipeline_run_id: string;
  status: PipelineRunStatus;
  ready: boolean;
  job_summary: ReturnType<typeof summarizePipelineJobs>;
};

export async function runPipelineFinalizer(
  store: PipelineStore,
  input: RunPipelineFinalizerInput,
): Promise<PipelineFinalizerResult> {
  const now = input.now ?? new Date();
  const jobs = await store.listPipelineJobs(input.pipeline_run_id);
  const job_summary = summarizePipelineJobs(jobs);
  const ready = isPipelineReadyForFinalization(job_summary);

  if (!ready && !input.orchestrator_failed) {
    return {
      pipeline_run_id: input.pipeline_run_id,
      status: "running",
      ready: false,
      job_summary,
    };
  }

  const status = resolvePipelineTerminalStatus({
    pipeline_run_id: input.pipeline_run_id,
    status: "running",
    orchestrator_failed: input.orchestrator_failed,
    job_summary,
  });

  if (status !== "running") {
    await store.finalizePipelineRun({
      pipeline_run_id: input.pipeline_run_id,
      status: status as "success" | "partial_success" | "failed",
      finished_at: now,
      error_message: input.orchestrator_failed ? "orchestrator failure" : null,
    });
  }

  return {
    pipeline_run_id: input.pipeline_run_id,
    status,
    ready,
    job_summary,
  };
}

export async function maybeFinalizePipelineRun(
  store: PipelineStore,
  pipeline_run_id: string,
  now = new Date(),
): Promise<PipelineFinalizerResult | null> {
  const jobs = await store.listPipelineJobs(pipeline_run_id);
  const summary = summarizePipelineJobs(jobs);
  if (!isPipelineReadyForFinalization(summary)) {
    return null;
  }
  return runPipelineFinalizer(store, { pipeline_run_id, now });
}

export function listNonTerminalJobs(jobs: RadarJobRecord[]): RadarJobRecord[] {
  return jobs.filter((job) => !["succeeded", "dead_letter"].includes(job.status));
}
