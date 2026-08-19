import { after } from "next/server";
import { runAnalysisGenerationWorkerBatch } from "@/lib/analysis/analysis-generation-service";

const DRAIN_RETRY_DELAYS_MS = [50, 400, 1500] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function drainAnalysisGenerationQueueWithRetry(input?: {
  limit?: number;
  source?: string;
}): Promise<void> {
  const limit = input?.limit ?? 2;
  const source = input?.source ?? "delayed_drain";
  for (let attempt = 0; attempt < DRAIN_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0 || DRAIN_RETRY_DELAYS_MS[0]! > 0) {
      await sleep(DRAIN_RETRY_DELAYS_MS[attempt]!);
    }
    try {
      const result = await runAnalysisGenerationWorkerBatch({ limit });
      console.info(
        JSON.stringify({
          type: "analysis_worker_kick_result",
          source,
          attempt: attempt + 1,
          ...result,
        }),
      );
      if (result.claimed > 0) return;
    } catch (error) {
      console.info(
        JSON.stringify({
          type: "analysis_worker_kick_error",
          source,
          attempt: attempt + 1,
          error_class: error instanceof Error ? error.message.slice(0, 64) : "unknown",
        }),
      );
    }
  }
}

export function kickAnalysisGenerationWorkerBestEffort(input?: { source?: string }): void {
  after(() => {
    void drainAnalysisGenerationQueueWithRetry({ source: input?.source ?? "after_kick" });
  });
}
