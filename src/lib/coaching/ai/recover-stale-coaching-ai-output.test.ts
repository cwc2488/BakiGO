import { describe, expect, it, beforeEach } from "vitest";
import {
  planStalePendingRecovery,
  shouldRateLimitRecoveryKick,
  markRecoveryKick,
  resetRecoveryKickRateLimitForTests,
  COACHING_AI_STALE_PENDING_MS,
} from "@/lib/coaching/ai/recover-stale-coaching-ai-output";

describe("recover-stale-coaching-ai-output", () => {
  beforeEach(() => {
    resetRecoveryKickRateLimitForTests();
  });

  it("P0-12 plans requeue for orphan stale pending", () => {
    const now = Date.parse("2026-08-13T08:30:00.000Z");
    const plan = planStalePendingRecovery({
      output: {
        id: "11853ed0-9595-4de5-8366-91137aeb36ff",
        status: "pending",
        inputFingerprint: "fp-incident",
        updatedAt: "2026-08-13T08:21:19.398Z",
        startedAt: null,
        completedAt: null,
      },
      activeJobs: [],
      nowMs: now,
      staleAfterMs: COACHING_AI_STALE_PENDING_MS,
    });
    expect(plan).toEqual({ action: "requeue", reason: "orphan_pending_no_active_job" });
  });

  it("does not requeue when active job exists", () => {
    const plan = planStalePendingRecovery({
      output: {
        id: "out-1",
        status: "pending",
        inputFingerprint: "fp-a",
        updatedAt: "2026-08-13T08:00:00.000Z",
        startedAt: null,
        completedAt: null,
      },
      activeJobs: [{ id: "job-1", status: "queued", inputFingerprint: "fp-a" }],
      nowMs: Date.parse("2026-08-13T08:30:00.000Z"),
    });
    expect(plan.action).toBe("reclaim_only");
  });

  it("P0-13 rate-limits recovery kicks", () => {
    const key = "enroll:2026-08-13";
    expect(shouldRateLimitRecoveryKick({ key, nowMs: 1000 })).toBe(false);
    markRecoveryKick({ key, nowMs: 1000 });
    expect(shouldRateLimitRecoveryKick({ key, nowMs: 10_000 })).toBe(true);
    expect(shouldRateLimitRecoveryKick({ key, nowMs: 1000 + 60_000 })).toBe(false);
  });

  it("noop for fresh pending", () => {
    const plan = planStalePendingRecovery({
      output: {
        id: "out-1",
        status: "pending",
        inputFingerprint: "fp-a",
        updatedAt: "2026-08-13T08:29:30.000Z",
        startedAt: null,
        completedAt: null,
      },
      activeJobs: [],
      nowMs: Date.parse("2026-08-13T08:30:00.000Z"),
      staleAfterMs: 90_000,
    });
    expect(plan.action).toBe("noop");
  });
});
