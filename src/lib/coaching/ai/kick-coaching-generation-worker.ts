import { after } from "next/server";
import { runCoachingGenerationWorkerBatch } from "@/lib/coaching/ai/run-coaching-generation-worker";

/**
 * Queue drain ownership (Hobby-compatible):
 * 1. Primary: post-submit after() — enqueue (if needed) then delayed claim retries
 * 2. Backup: Production external POST /api/coaching/jobs/process (~1 min)
 * 3. Safety net: portal ai-output stale pending recovery on reopen
 *
 * after() alone is NOT sufficient; delayed retries address claim-before-visible races.
 */

const DRAIN_RETRY_DELAYS_MS = [50, 400, 1500] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDrainAttempt(input: {
  limit: number;
  concurrency: number;
  source: string;
  attempt: number;
}) {
  const result = await runCoachingGenerationWorkerBatch({
    limit: input.limit,
    concurrency: input.concurrency,
  });
  console.info(
    JSON.stringify({
      type: "coaching_worker_kick_result",
      source: input.source,
      attempt: input.attempt,
      claimed: result.claimed,
      completed: result.completed,
      failed: result.failed,
      skipped: result.skipped,
      superseded: result.superseded,
      retryScheduled: result.retryScheduled,
      jobIds: result.jobIds,
      duration: result.durationMs,
      outcomes: result.results.map((item) => item.outcome),
    }),
  );
  return result;
}

/**
 * Best-effort drain with short retries when first claim returns 0
 * (job row may not yet be visible to claim after enqueue commit).
 * Never called from the customer request await path.
 */
export async function drainCoachingGenerationQueueWithRetry(input?: {
  limit?: number;
  concurrency?: number;
  source?: string;
  /** Prefer claiming this job id when known (logged only; claim is FIFO). */
  preferJobId?: string | null;
}): Promise<void> {
  const limit = input?.limit ?? 2;
  const concurrency = input?.concurrency ?? 1;
  const source = input?.source ?? "delayed_drain";

  for (let attempt = 0; attempt < DRAIN_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0 || DRAIN_RETRY_DELAYS_MS[0]! > 0) {
      await sleep(DRAIN_RETRY_DELAYS_MS[attempt]!);
    }
    try {
      const result = await runDrainAttempt({
        limit,
        concurrency,
        source,
        attempt: attempt + 1,
      });
      if (result.claimed > 0) {
        return;
      }
      if (input?.preferJobId) {
        console.info(
          JSON.stringify({
            type: "coaching_worker_kick_miss",
            source,
            attempt: attempt + 1,
            preferJobId: input.preferJobId,
            reason: "claimed_0_retrying",
          }),
        );
      }
    } catch (workerError) {
      console.error(`[coaching] worker drain attempt failed source=${source}`, workerError);
    }
  }
}

/**
 * Schedule drain after the HTTP response is committed.
 */
export function kickCoachingGenerationWorkerBestEffort(input?: {
  limit?: number;
  concurrency?: number;
  source?: string;
  preferJobId?: string | null;
  /** When true, use delayed retries (default for post_submit). */
  delayedRetry?: boolean;
}): void {
  const delayedRetry = input?.delayedRetry ?? true;
  const run = () => {
    if (delayedRetry) {
      return drainCoachingGenerationQueueWithRetry({
        limit: input?.limit,
        concurrency: input?.concurrency,
        source: input?.source ?? "post_submit",
        preferJobId: input?.preferJobId,
      });
    }
    return runDrainAttempt({
      limit: input?.limit ?? 2,
      concurrency: input?.concurrency ?? 1,
      source: input?.source ?? "unspecified",
      attempt: 1,
    }).then(() => undefined);
  };

  try {
    after(() => {
      void run().catch((workerError) => {
        console.error(`[coaching] worker kick failed source=${input?.source ?? "unspecified"}`, workerError);
      });
    });
  } catch {
    void run().catch((workerError) => {
      console.error(`[coaching] worker kick failed source=${input?.source ?? "unspecified"}`, workerError);
    });
  }
}
