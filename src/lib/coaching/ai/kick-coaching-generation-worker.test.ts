import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const runBatch = vi.fn();

vi.mock("@/lib/coaching/ai/run-coaching-generation-worker", () => ({
  runCoachingGenerationWorkerBatch: (...args: unknown[]) => runBatch(...args),
}));

vi.mock("next/server", () => ({
  after: (fn: () => void) => {
    fn();
  },
}));

describe("drainCoachingGenerationQueueWithRetry", () => {
  beforeEach(() => {
    runBatch.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries when first claim returns 0 then stops after claim", async () => {
    runBatch
      .mockResolvedValueOnce({
        claimed: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        superseded: 0,
        retryScheduled: 0,
        jobIds: [],
        durationMs: 1,
        results: [],
      })
      .mockResolvedValueOnce({
        claimed: 1,
        completed: 1,
        failed: 0,
        skipped: 0,
        superseded: 0,
        retryScheduled: 0,
        jobIds: ["job-1"],
        durationMs: 10,
        results: [{ jobId: "job-1", outcome: "completed" }],
      });

    const { drainCoachingGenerationQueueWithRetry } = await import(
      "@/lib/coaching/ai/kick-coaching-generation-worker"
    );

    const promise = drainCoachingGenerationQueueWithRetry({
      source: "test",
      preferJobId: "job-1",
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(runBatch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
    await promise;
    expect(runBatch).toHaveBeenCalledTimes(2);
  });
});
