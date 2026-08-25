import { describe, expect, it } from "vitest";
import {
  computeBackoffMs,
  resolveNextJobStatus,
  resolveRetryPolicy,
} from "./retry-policy";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "./queue";

describe("retry policy", () => {
  it("dead letters schema validation immediately", () => {
    const policy = resolveRetryPolicy("SCHEMA_VALIDATION");
    expect(policy.retryable).toBe(false);
    expect(
      resolveNextJobStatus({
        retryable: false,
        attempt_count: 1,
        max_attempts: 1,
      }),
    ).toBe("dead_letter");
  });

  it("applies exponential backoff for rate limits", () => {
    const policy = resolveRetryPolicy("RATE_LIMIT");
    expect(computeBackoffMs(policy, 2, () => 0)).toBe(60_000);
  });

  it("treats NETWORK and MISSING_ARTIFACT with correct retryability", () => {
    expect(resolveRetryPolicy("NETWORK").retryable).toBe(true);
    expect(resolveRetryPolicy("MISSING_ARTIFACT").retryable).toBe(false);
    expect(resolveRetryPolicy("SCHEMA_INVALID").retryable).toBe(false);
  });
});

describe("RadarJobQueue", () => {
  it("returns existing job on idempotent enqueue", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);

    const { job: first } = await queue.enqueue({
      job_type: "analyze",
      idempotency_key: "analyze:cand_1:fp_abc",
      payload: { candidate_id: "cand_1" },
    });
    const { job: second, created } = await queue.enqueue({
      job_type: "analyze",
      idempotency_key: "analyze:cand_1:fp_abc",
      payload: { candidate_id: "cand_1" },
    });

    expect(second.id).toBe(first.id);
    expect(created).toBe(false);
  });

  it("claims pending jobs in priority order", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-09T03:00:00.000Z");

    await queue.enqueue(
      {
        job_type: "enrich",
        idempotency_key: "enrich:low",
        priority: 1,
      },
      now,
    );
    await queue.enqueue(
      {
        job_type: "enrich",
        idempotency_key: "enrich:high",
        priority: 10,
      },
      now,
    );

    const claimed = await queue.claim({ limit: 1, now });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].idempotency_key).toBe("enrich:high");
    expect(claimed[0].status).toBe("running");
    expect(claimed[0].attempt_count).toBe(1);
  });

  it("retries retryable failures then dead letters after max attempts", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-09T03:00:00.000Z");

    const { job } = await queue.enqueue(
      {
        job_type: "analyze",
        idempotency_key: "analyze:retry",
        max_attempts: 2,
      },
      now,
    );

    const [claimed] = await queue.claim({ limit: 1, now });
    expect(claimed.id).toBe(job.id);

    const failedOnce = await queue.fail({
      job_id: job.id,
      error_code: "UPSTREAM_TIMEOUT",
      error_message: "timeout",
      retryable: true,
      now,
    });
    expect(failedOnce?.status).toBe("failed");

    const retryNow = new Date(now.getTime() + 60_000);
    const [reclaimed] = await queue.claim({ limit: 1, now: retryNow });
    expect(reclaimed.id).toBe(job.id);
    expect(reclaimed.attempt_count).toBe(2);

    const dead = await queue.fail({
      job_id: job.id,
      error_code: "UPSTREAM_TIMEOUT",
      error_message: "timeout again",
      retryable: true,
      now: retryNow,
    });
    expect(dead?.status).toBe("dead_letter");
  });

  it("marks successful jobs as succeeded with audit run", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-09T03:00:00.000Z");

    const { job } = await queue.enqueue(
      {
        job_type: "normalize",
        idempotency_key: "normalize:cand_1",
      },
      now,
    );
    await queue.claim({ limit: 1, now });

    const completed = await queue.complete({ job_id: job.id }, now);
    expect(completed?.status).toBe("succeeded");
    expect(store.jobRuns.some((run) => run.status === "succeeded")).toBe(true);
  });

  it("does not reclaim a running job before retry window", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-09T03:00:00.000Z");

    const { job } = await queue.enqueue(
      {
        job_type: "enrich",
        idempotency_key: "enrich:backoff",
        max_attempts: 3,
      },
      now,
    );

    await queue.claim({ limit: 1, now });
    await queue.fail({
      job_id: job.id,
      error_code: "RATE_LIMIT",
      error_message: "limited",
      retryable: true,
      now,
    });

    const tooEarly = new Date(now.getTime() + 1_000);
    const earlyClaim = await queue.claim({ limit: 1, now: tooEarly });
    expect(earlyClaim).toHaveLength(0);

    // Exponential base (30s) + up to 25% jitter — wait past the ceiling.
    const afterBackoff = new Date(now.getTime() + 45_000);
    const [retryClaim] = await queue.claim({ limit: 1, now: afterBackoff });
    expect(retryClaim.id).toBe(job.id);
  });

  it("does not claim succeeded or dead_letter jobs", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-09T03:00:00.000Z");

    const { job: done } = await queue.enqueue(
      { job_type: "score", idempotency_key: "score:done" },
      now,
    );
    await queue.claim({ limit: 1, now });
    await queue.complete({ job_id: done.id }, now);

    const { job: dead } = await queue.enqueue(
      { job_type: "score", idempotency_key: "score:dead", max_attempts: 1 },
      now,
    );
    await queue.claim({ limit: 1, now });
    await queue.fail({
      job_id: dead.id,
      error_code: "SCHEMA_VALIDATION",
      error_message: "invalid",
      retryable: false,
      now,
    });

    expect(await queue.claim({ limit: 5, now })).toHaveLength(0);
  });

  it("prevents double worker ownership while job is running", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-09T03:00:00.000Z");

    await queue.enqueue(
      {
        job_type: "discover",
        idempotency_key: "discover:member:kw",
      },
      now,
    );

    const firstClaim = await queue.claim({ limit: 1, now });
    const secondClaim = await queue.claim({ limit: 1, now });

    expect(firstClaim).toHaveLength(1);
    expect(secondClaim).toHaveLength(0);
    expect(firstClaim[0].status).toBe("running");
  });

  it("insertJob store path supports idempotent enqueue via idempotency key lookup", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-09T03:00:00.000Z");

    const first = await queue.enqueue(
      {
        job_type: "normalize",
        idempotency_key: "normalize:cand_x",
      },
      now,
    );
    const second = await queue.enqueue(
      {
        job_type: "normalize",
        idempotency_key: "normalize:cand_x",
      },
      now,
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await store.findByIdempotencyKey("normalize:cand_x")).not.toBeNull();
  });
});
