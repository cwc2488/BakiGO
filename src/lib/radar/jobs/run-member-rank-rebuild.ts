import { pipelineJobKey } from "./chain";
import type { RadarJobQueue } from "./queue";
import type { RadarRepository } from "../repository/types";
import { runRankWorker } from "./workers/rank-worker";
import type { WorkerContext } from "./workers/dispatch";
import type { RadarJobRecord } from "./types";

export type MemberRankRebuildInput = {
  member_id: string;
  snapshot_date: string;
  pipeline_run_id: string;
  recovery_tag?: string;
  /** Each authorized rebuild gets a fresh queue idempotency key (never reuse succeeded rank jobs). */
  force_new_job?: boolean;
};

export type MemberRankRebuildResult = {
  ok: boolean;
  item_count: number;
  snapshot_id: string | null;
  metrics: Record<string, unknown> | null;
  error_code?: string;
  error_message?: string;
};

/**
 * Re-run Rank for one member/day using existing score snapshots (no upstream AI).
 */
export async function runMemberRankRebuild(
  ctx: WorkerContext,
  input: MemberRankRebuildInput,
): Promise<MemberRankRebuildResult> {
  const now = ctx.now ?? new Date();
  const recoveryTag = input.recovery_tag ?? "score_rank_contract_rebuild";

  await ctx.repo.clearMemberRankEnqueued({
    pipeline_run_id: input.pipeline_run_id,
    member_id: input.member_id,
  });

  const idempotencySuffix =
    input.force_new_job !== false
      ? `${recoveryTag}:${now.toISOString()}`
      : recoveryTag;

  const { job } = await ctx.queue.enqueue(
    {
      pipeline_run_id: input.pipeline_run_id,
      job_type: "rank",
      idempotency_key: pipelineJobKey(input.snapshot_date, [
        "rank",
        input.member_id,
        idempotencySuffix,
      ]),
      payload: {
        run_date: input.snapshot_date,
        member_id: input.member_id,
        artifact_refs: {},
        recovery: recoveryTag,
      },
      priority: 100_000,
      max_attempts: 8,
    },
    now,
  );

  const rankJob: RadarJobRecord = {
    ...job,
    status: "running",
    started_at: now.toISOString(),
    attempt_count: Number(job.attempt_count ?? 0) + 1,
    updated_at: now.toISOString(),
  };

  const result = await runRankWorker(ctx, rankJob);
  if (result.status === "succeeded") {
    await ctx.queue.complete({ job_id: job.id, metrics: result.metrics }, now);
    return {
      ok: true,
      item_count: Number(result.metrics?.item_count ?? 0),
      snapshot_id:
        typeof result.metrics?.snapshot_id === "string" ? result.metrics.snapshot_id : null,
      metrics: result.metrics ?? null,
    };
  }

  await ctx.queue.fail({
    job_id: job.id,
    error_code: result.error_code ?? "WORKER_FAILED",
    error_message: result.error_message ?? "rank rebuild failed",
    retryable: false,
    now,
  });

  return {
    ok: false,
    item_count: 0,
    snapshot_id: null,
    metrics: result.metrics ?? null,
    error_code: result.error_code,
    error_message: result.error_message,
  };
}
