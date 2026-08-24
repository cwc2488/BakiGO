import { randomUUID } from "node:crypto";
import type { RadarJobQueue } from "../queue";
import type { ChainedJobPayload } from "../chain";
import { pipelineJobKey } from "../chain";
import type { RadarJobRecord } from "../types";
import type { RadarRepository } from "../../repository/types";
import type { SourceAdapterRegistry } from "../../sources/registry";
import type { PipelineStore } from "../../pipeline/store";
import { maybeFinalizePipelineRun } from "../../pipeline/run-finalizer";
import type { AiRadarLlmProvider } from "../../ai/provider";
import { runDiscoverWorker } from "./discover-worker";
import { runEnrichWorker } from "./enrich-worker";
import { runNormalizeWorker } from "./normalize-worker";
import { runAnalyzeWorker } from "./analyze-worker";
import { runScoreWorker } from "./score-worker";
import { runRankWorker } from "./rank-worker";

export type WorkerContext = {
  repo: RadarRepository;
  queue: RadarJobQueue;
  sources: SourceAdapterRegistry;
  pipelineStore?: PipelineStore & { trackJob?: (pipeline_run_id: string, job: RadarJobRecord) => void };
  llm?: AiRadarLlmProvider;
  now?: Date;
  scoreMemberIds?: string[];
};

export type WorkerResult = {
  job_id: string;
  status: "succeeded" | "failed";
  error_code?: string;
  error_message?: string;
  metrics?: Record<string, unknown>;
};

export function enrichPayload(job: RadarJobRecord): ChainedJobPayload {
  return job.payload as ChainedJobPayload;
}

export async function dispatchRadarJob(
  ctx: WorkerContext,
  job: RadarJobRecord,
): Promise<WorkerResult> {
  switch (job.job_type) {
    case "discover":
      return runDiscoverWorker(ctx, job);
    case "enrich":
      return runEnrichWorker(ctx, job);
    case "normalize":
      return runNormalizeWorker(ctx, job);
    case "analyze":
      return runAnalyzeWorker(ctx, job);
    case "score":
      return runScoreWorker(ctx, job);
    case "rank":
      return runRankWorker(ctx, job);
    default:
      return {
        job_id: job.id,
        status: "failed",
        error_code: "UNKNOWN_JOB_TYPE",
        error_message: `Unsupported job type: ${job.job_type}`,
      };
  }
}

export async function processClaimedJob(ctx: WorkerContext, job: RadarJobRecord): Promise<void> {
  const now = ctx.now ?? new Date();
  const result = await dispatchRadarJob({ ...ctx, now }, job);

  if (result.status === "succeeded") {
    await ctx.queue.complete({ job_id: job.id, metrics: result.metrics }, now);
  } else {
    await ctx.queue.fail({
      job_id: job.id,
      error_code: result.error_code ?? "WORKER_FAILED",
      error_message: result.error_message ?? "worker failed",
      retryable: result.error_code !== "SCHEMA_VALIDATION",
      now,
    });
  }

  if (job.pipeline_run_id && ctx.pipelineStore?.trackJob) {
    ctx.pipelineStore.trackJob(job.pipeline_run_id, {
      ...job,
      status: result.status === "succeeded" ? "succeeded" : "failed",
    });
    await maybeFinalizePipelineRun(ctx.pipelineStore, job.pipeline_run_id, now);
  }
}

export async function enqueueNormalizeAfterEnrich(
  ctx: WorkerContext,
  input: {
    pipeline_run_id: string | null;
    run_date: string;
    candidate_id: string;
    enrich_job_id: string;
    raw_snapshot_ids: string[];
    priority?: number;
  },
) {
  return ctx.queue.enqueue(
    {
      pipeline_run_id: input.pipeline_run_id,
      job_type: "normalize",
      idempotency_key: pipelineJobKey(input.run_date, [
        "normalize",
        input.candidate_id,
        input.enrich_job_id,
      ]),
      payload: {
        run_date: input.run_date,
        candidate_id: input.candidate_id,
        artifact_refs: {
          enrich_job_id: input.enrich_job_id,
          raw_snapshot_ids: input.raw_snapshot_ids,
          upstream_job_id: input.enrich_job_id,
        },
        depends_on: {
          job_id: input.enrich_job_id,
          job_type: "enrich",
          artifact_field: "raw_snapshot_ids",
        },
      },
      priority: input.priority ?? 0,
    },
    ctx.now,
  );
}

export async function enqueueAnalyzeAfterNormalize(
  ctx: WorkerContext,
  input: {
    pipeline_run_id: string | null;
    run_date: string;
    candidate_id: string;
    normalization_run_id: string;
    priority?: number;
  },
) {
  return ctx.queue.enqueue(
    {
      pipeline_run_id: input.pipeline_run_id,
      job_type: "analyze",
      idempotency_key: pipelineJobKey(input.run_date, [
        "analyze",
        input.candidate_id,
        input.normalization_run_id,
      ]),
      payload: {
        run_date: input.run_date,
        candidate_id: input.candidate_id,
        artifact_refs: {
          normalization_run_id: input.normalization_run_id,
        },
        depends_on: {
          job_id: input.normalization_run_id,
          job_type: "normalize",
          artifact_field: "normalization_run_id",
        },
      },
      priority: input.priority ?? 0,
    },
    ctx.now,
  );
}

export async function enqueueScoreJobsForMembers(
  ctx: WorkerContext,
  input: {
    pipeline_run_id: string | null;
    run_date: string;
    candidate_id: string;
    analysis_run_id: string;
    member_ids: string[];
  },
) {
  if (input.pipeline_run_id) {
    for (const member_id of input.member_ids) {
      await ctx.repo.initMemberScoreProgress({
        pipeline_run_id: input.pipeline_run_id,
        member_id,
        expected_score_jobs: 1,
      });
    }
  }

  for (const member_id of input.member_ids) {
    await ctx.queue.enqueue(
      {
        pipeline_run_id: input.pipeline_run_id,
        job_type: "score",
        idempotency_key: pipelineJobKey(input.run_date, [
          "score",
          member_id,
          input.candidate_id,
          input.analysis_run_id,
        ]),
        payload: {
          run_date: input.run_date,
          member_id,
          candidate_id: input.candidate_id,
          artifact_refs: {
            analysis_run_id: input.analysis_run_id,
          },
        },
      },
      ctx.now,
    );
  }
}

export async function maybeEnqueueRank(
  ctx: WorkerContext,
  input: { pipeline_run_id: string; run_date: string; member_id: string },
) {
  const should = await ctx.repo.shouldEnqueueRank({
    pipeline_run_id: input.pipeline_run_id,
    member_id: input.member_id,
  });
  if (!should) return null;

  await ctx.repo.markMemberRankEnqueued({
    pipeline_run_id: input.pipeline_run_id,
    member_id: input.member_id,
  });

  return ctx.queue.enqueue(
    {
      pipeline_run_id: input.pipeline_run_id,
      job_type: "rank",
      idempotency_key: pipelineJobKey(input.run_date, ["rank", input.member_id]),
      payload: {
        run_date: input.run_date,
        member_id: input.member_id,
        artifact_refs: {},
      },
    },
    ctx.now,
  );
}

export function newNormalizationRunId(candidate_id: string, now = new Date()): string {
  return `norm_${candidate_id}_${now.getTime()}`;
}

export function newAnalysisRunId(): string {
  return randomUUID();
}

export async function runWorkerBatch(ctx: WorkerContext, limit = 25): Promise<number> {
  const jobs = await ctx.queue.claim({ limit, now: ctx.now });
  for (const job of jobs) {
    try {
      await processClaimedJob(ctx, job);
    } catch (error) {
      const now = ctx.now ?? new Date();
      await ctx.queue.fail({
        job_id: job.id,
        error_code: "WORKER_UNCAUGHT",
        error_message: error instanceof Error ? error.message : "worker threw",
        retryable: true,
        now,
      });
    }
  }
  return jobs.length;
}
