import {
  claimCoachingGenerationJobs,
  countClaimableGenerationJobs,
  countProcessingGenerationJobs,
  reclaimStaleCoachingGenerationJobs,
} from "@/lib/coaching/ai/coaching-ai-store";
import {
  classifyCoachingAiError,
  logCoachingAiJobLifecycle,
} from "@/lib/coaching/ai/coaching-ai-job-lifecycle";
import { processCoachingGenerationJob } from "@/lib/coaching/ai/process-coaching-generation-job";
import {
  COACHING_GENERATION_CLAIM_LIMIT,
  COACHING_GENERATION_JOB_STALE_MS,
  COACHING_GENERATION_WORKER_CONCURRENCY,
  type CoachingGenerationJobRecord,
} from "@/types/coaching-ai";
import { randomUUID } from "node:crypto";

export type CoachingGenerationWorkerBatchResult = {
  reclaimed: number;
  claimed: number;
  completed: number;
  superseded: number;
  retryScheduled: number;
  failed: number;
  skipped: number;
  recovered: number;
  claimableQueued: number;
  processingCount: number;
  jobIds: string[];
  durationMs: number;
  results: Array<{ jobId: string; outcome: string }>;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]!);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function runCoachingGenerationWorkerBatch(input?: {
  limit?: number;
  concurrency?: number;
  lockedBy?: string;
}): Promise<CoachingGenerationWorkerBatchResult> {
  const started = Date.now();
  const staleMinutes = Math.max(1, Math.round(COACHING_GENERATION_JOB_STALE_MS / 60_000));
  const reclaimed = await reclaimStaleCoachingGenerationJobs(staleMinutes);

  const lockedBy = input?.lockedBy ?? `coaching-worker:${randomUUID().slice(0, 8)}`;
  const limit = input?.limit ?? COACHING_GENERATION_CLAIM_LIMIT;

  logCoachingAiJobLifecycle({
    stage: "job_claim_attempt",
    meta: { limit, locked_by_suffix: lockedBy.slice(-8), reclaimed },
  });

  const claimed = await claimCoachingGenerationJobs({
    limit,
    lockedBy,
  });

  let claimableQueued = 0;
  let processingCount = 0;
  try {
    claimableQueued = await countClaimableGenerationJobs();
    processingCount = await countProcessingGenerationJobs();
  } catch {
    // Observability only — never fail the batch.
  }

  if (claimed.length === 0) {
    logCoachingAiJobLifecycle({
      stage: "job_claim_empty",
      reason:
        claimableQueued > 0
          ? "claimable_queued_but_claimed_0"
          : processingCount > 0
            ? "processing_in_flight"
            : "queue_empty",
      meta: {
        claimable_queued: claimableQueued,
        processing_count: processingCount,
        reclaimed,
        limit,
      },
    });
  } else {
    for (const job of claimed) {
      logCoachingAiJobLifecycle({
        stage: "job_claimed",
        job_id: job.id,
        output_id: job.outputId,
        enrollment_id: job.enrollmentId,
        log_date: job.logDate,
        meta: { attempt_count: job.attemptCount, locked_by_suffix: lockedBy.slice(-8) },
      });
    }
  }

  const processed = await mapWithConcurrency(
    claimed,
    input?.concurrency ?? COACHING_GENERATION_WORKER_CONCURRENCY,
    async (job: CoachingGenerationJobRecord) => {
      try {
        const result = await processCoachingGenerationJob(job);
        return { jobId: job.id, ...result };
      } catch (error) {
        // Belt-and-suspenders: processCoachingGenerationJob already catches,
        // but never allow an uncaught rejection to leave a silent claimed job.
        const errorClass = classifyCoachingAiError(error);
        logCoachingAiJobLifecycle({
          stage: "job_failed",
          job_id: job.id,
          output_id: job.outputId,
          enrollment_id: job.enrollmentId,
          log_date: job.logDate,
          error_class: errorClass,
          reason: "worker_uncaught",
        });
        return { jobId: job.id, outcome: "failed" as const, error: errorClass };
      }
    },
  );

  const results = processed.map((item) => ({ jobId: item.jobId, outcome: item.outcome }));
  const superseded = processed.filter((item) => item.outcome === "superseded").length;
  const batch: CoachingGenerationWorkerBatchResult = {
    reclaimed,
    claimed: claimed.length,
    completed: processed.filter((item) => item.outcome === "completed").length,
    superseded,
    retryScheduled: processed.filter((item) => item.outcome === "retry_scheduled").length,
    failed: processed.filter((item) => item.outcome === "failed").length,
    skipped: superseded,
    recovered: reclaimed,
    claimableQueued,
    processingCount,
    jobIds: results.map((item) => item.jobId),
    durationMs: Date.now() - started,
    results,
  };

  logCoachingAiJobLifecycle({
    stage: "process_batch_summary",
    duration_ms: batch.durationMs,
    meta: {
      claimed: batch.claimed,
      completed: batch.completed,
      failed: batch.failed,
      superseded: batch.superseded,
      retry_scheduled: batch.retryScheduled,
      recovered: batch.recovered,
      claimable_queued: batch.claimableQueued,
      processing_count: batch.processingCount,
    },
  });

  return batch;
}
