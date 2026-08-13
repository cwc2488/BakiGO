import {
  claimCoachingGenerationJobs,
  reclaimStaleCoachingGenerationJobs,
} from "@/lib/coaching/ai/coaching-ai-store";
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
  const claimed = await claimCoachingGenerationJobs({
    limit: input?.limit ?? COACHING_GENERATION_CLAIM_LIMIT,
    lockedBy,
  });

  const processed = await mapWithConcurrency(
    claimed,
    input?.concurrency ?? COACHING_GENERATION_WORKER_CONCURRENCY,
    async (job: CoachingGenerationJobRecord) => {
      const result = await processCoachingGenerationJob(job);
      return { jobId: job.id, ...result };
    },
  );

  const results = processed.map((item) => ({ jobId: item.jobId, outcome: item.outcome }));
  const superseded = processed.filter((item) => item.outcome === "superseded").length;
  return {
    reclaimed,
    claimed: claimed.length,
    completed: processed.filter((item) => item.outcome === "completed").length,
    superseded,
    retryScheduled: processed.filter((item) => item.outcome === "retry_scheduled").length,
    failed: processed.filter((item) => item.outcome === "failed").length,
    skipped: superseded,
    jobIds: results.map((item) => item.jobId),
    durationMs: Date.now() - started,
    results,
  };
}
