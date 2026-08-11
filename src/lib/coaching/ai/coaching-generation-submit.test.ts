import { describe, expect, it } from "vitest";
import {
  buildFailedJobRetryPatch,
  buildPendingOutputPatch,
  buildQueuedGenerationJob,
  buildStaleJobRecoveryPatch,
  hasActiveJobForFingerprint,
  planDailyCoachGenerationSubmit,
  preservesCompletedOutputWhenDenied,
  resolveGenerationOutputMutation,
  shouldReclaimStaleProcessingJob,
} from "@/lib/coaching/ai/coaching-generation-submit";
import { COACHING_AI_MAX_REGENERATIONS_PER_DAY, COACHING_AI_POINT_KEY } from "@/types/coaching-ai";

describe("planDailyCoachGenerationSubmit", () => {
  it("enqueues initial generation when no prior output", () => {
    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "fp-a",
      existingOutput: null,
      activeJobs: [],
    });

    expect(decision).toEqual({
      action: "enqueue",
      reason: "initial",
      nextRegenerationCount: 0,
      resetOutputStatus: "pending",
    });
  });

  it("skips when same fingerprint already completed", () => {
    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "fp-a",
      existingOutput: {
        inputFingerprint: "fp-a",
        status: "completed",
        regenerationCount: 0,
      },
      activeJobs: [],
    });

    expect(decision).toEqual({ action: "skip", reason: "same_fingerprint_completed" });
  });

  it("skips when same fingerprint job is already in flight", () => {
    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "fp-a",
      existingOutput: {
        inputFingerprint: "fp-b",
        status: "pending",
        regenerationCount: 0,
      },
      activeJobs: [{ inputFingerprint: "fp-a", status: "queued" }],
    });

    expect(decision).toEqual({ action: "skip", reason: "same_fingerprint_in_flight" });
  });

  it("enqueues when fingerprint changed and under regeneration cap", () => {
    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "fp-b",
      existingOutput: {
        inputFingerprint: "fp-a",
        status: "completed",
        regenerationCount: 0,
      },
      activeJobs: [],
    });

    expect(decision).toEqual({
      action: "enqueue",
      reason: "fingerprint_changed",
      nextRegenerationCount: 1,
      resetOutputStatus: "pending",
    });
  });

  it("blocks regeneration when daily cap reached", () => {
    const existingOutput = {
      inputFingerprint: "fp-b",
      status: "completed" as const,
      regenerationCount: COACHING_AI_MAX_REGENERATIONS_PER_DAY,
    };

    const decision = planDailyCoachGenerationSubmit({
      fingerprint: "fp-c",
      existingOutput,
      activeJobs: [],
    });

    expect(decision).toEqual({ action: "skip", reason: "max_regenerations_reached" });
    expect(resolveGenerationOutputMutation(decision, "fp-c")).toBeNull();
    expect(preservesCompletedOutputWhenDenied(existingOutput, decision, null)).toBe(true);
  });
});

describe("generation job helpers", () => {
  it("detects active jobs for fingerprint", () => {
    expect(
      hasActiveJobForFingerprint(
        [
          { inputFingerprint: "fp-a", status: "completed" },
          { inputFingerprint: "fp-b", status: "processing" },
        ],
        "fp-b",
      ),
    ).toBe(true);
    expect(hasActiveJobForFingerprint([{ inputFingerprint: "fp-b", status: "failed" }], "fp-b")).toBe(false);
  });

  it("builds pending output patch with unified point key", () => {
    const patch = buildPendingOutputPatch({ fingerprint: "fp-a", regenerationCount: 1 });
    expect(patch.pointKey).toBe(COACHING_AI_POINT_KEY);
    expect(patch.status).toBe("pending");
    expect(patch.regenerationCount).toBe(1);
    expect(patch.outputJson).toBeNull();
  });

  it("builds queued job defaults", () => {
    const job = buildQueuedGenerationJob({
      outputId: "out-1",
      enrollmentId: "enroll-1",
      customerId: "cust-1",
      ownerMemberId: "member-1",
      logDate: "2026-08-11",
      fingerprint: "fp-a",
    });

    expect(job.status).toBe("queued");
    expect(job.attemptCount).toBe(0);
    expect(job.lockedAt).toBeNull();
  });

  it("flags stale processing jobs for recovery", () => {
    const nowMs = Date.parse("2026-08-11T12:00:00.000Z");
    const lockedAt = "2026-08-11T11:30:00.000Z";

    expect(
      shouldReclaimStaleProcessingJob({ status: "processing", lockedAt }, nowMs, 15 * 60 * 1000),
    ).toBe(true);
    expect(
      shouldReclaimStaleProcessingJob({ status: "processing", lockedAt }, nowMs, 60 * 60 * 1000),
    ).toBe(false);
    expect(shouldReclaimStaleProcessingJob({ status: "queued", lockedAt: null }, nowMs)).toBe(false);
  });

  it("builds stale and retry patches", () => {
    expect(buildStaleJobRecoveryPatch("2026-08-11T12:00:00.000Z")).toEqual({
      status: "queued",
      lockedAt: null,
      lockedBy: null,
      availableAt: "2026-08-11T12:00:00.000Z",
    });

    expect(
      buildFailedJobRetryPatch({
        attemptCount: 1,
        lastError: "timeout",
        availableAt: "2026-08-11T12:05:00.000Z",
      }),
    ).toEqual({
      status: "queued",
      attemptCount: 2,
      lastError: "timeout",
      availableAt: "2026-08-11T12:05:00.000Z",
      lockedAt: null,
      lockedBy: null,
    });
  });
});
