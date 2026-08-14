import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyCoachingAiError,
  evaluateCoachingAiTerminalInvariant,
  getRecoveryAttemptCount,
  incrementRecoveryAttempt,
  isRecoveryAttemptExhausted,
  logCoachingAiJobLifecycle,
  resetRecoveryAttemptCountsForTests,
  COACHING_AI_RECOVERY_ATTEMPT_LIMIT,
} from "@/lib/coaching/ai/coaching-ai-job-lifecycle";
import {
  planStalePendingRecovery,
  resetRecoveryKickRateLimitForTests,
  shouldRateLimitRecoveryKick,
  markRecoveryKick,
  COACHING_AI_STALE_PENDING_MS,
} from "@/lib/coaching/ai/recover-stale-coaching-ai-output";
import { resolveCustomerFacingAiProgress } from "@/lib/coaching/ai/customer-facing-ai-progress";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("P0.3 REL — coaching AI worker reliability", () => {
  beforeEach(() => {
    resetRecoveryAttemptCountsForTests();
    resetRecoveryKickRateLimitForTests();
  });

  it("REL-01 enqueue → claimed → completed stages exist in code", () => {
    const enqueue = readSrc("src/lib/coaching/ai/enqueue-daily-coach-generation-fast.ts");
    const worker = readSrc("src/lib/coaching/ai/run-coaching-generation-worker.ts");
    const process = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
    expect(enqueue).toContain('stage: "job_enqueued"');
    expect(worker).toContain('stage: "job_claimed"');
    expect(process).toContain('stage: "job_completed"');
  });

  it("REL-02 setup throw paths emit job_failed or job_retry_scheduled", () => {
    const process = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
    expect(process).toContain('stage: "job_failed"');
    expect(process).toContain('stage: "job_retry_scheduled"');
    expect(process).toContain("classifyCoachingAiError");
  });

  it("REL-03 claimed worker crash/stale → recovered path wired", () => {
    const recover = readSrc("src/lib/coaching/ai/recover-stale-coaching-ai-output.ts");
    expect(recover).toContain('stage: "job_recovered"');
    expect(recover).toContain("reclaimStaleCoachingGenerationJobs");
    expect(recover).toContain("orphan_pending_no_active_job");
  });

  it("REL-04 superseded → terminal telemetry", () => {
    const process = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
    expect(process).toContain('stage: "job_superseded"');
    expect(process).toContain("fingerprint_stale_superseded_requeued");
    expect(process).toContain("output_fingerprint_advanced_requeued");
  });

  it("REL-05 orphan pending → requeue plan", () => {
    const plan = planStalePendingRecovery({
      output: {
        id: "out-orphan",
        status: "pending",
        inputFingerprint: "fp-1",
        updatedAt: "2026-08-13T08:00:00.000Z",
        startedAt: null,
        completedAt: null,
      },
      activeJobs: [],
      nowMs: Date.parse("2026-08-13T08:30:00.000Z"),
      staleAfterMs: COACHING_AI_STALE_PENDING_MS,
    });
    expect(plan).toEqual({ action: "requeue", reason: "orphan_pending_no_active_job" });
    const invariant = evaluateCoachingAiTerminalInvariant({
      outputStatus: "pending",
      activeJobCount: 0,
    });
    expect(invariant).toEqual({ ok: true, kind: "recoverable_orphan" });
  });

  it("REL-06 duplicate recovery → idempotent + rate limit + attempt limit", () => {
    const key = "enroll:2026-08-13";
    expect(shouldRateLimitRecoveryKick({ key, nowMs: 1000 })).toBe(false);
    markRecoveryKick({ key, nowMs: 1000 });
    expect(shouldRateLimitRecoveryKick({ key, nowMs: 10_000 })).toBe(true);

    for (let i = 0; i < COACHING_AI_RECOVERY_ATTEMPT_LIMIT; i += 1) {
      incrementRecoveryAttempt(key);
    }
    expect(isRecoveryAttemptExhausted(key)).toBe(true);
    expect(getRecoveryAttemptCount(key)).toBe(COACHING_AI_RECOVERY_ATTEMPT_LIMIT);

    const recover = readSrc("src/lib/coaching/ai/recover-stale-coaching-ai-output.ts");
    expect(recover).toContain("idempotent_active_job_exists");
    expect(recover).toContain("recovery_attempt_limit");
  });

  it("REL-07 after() + external processor race uses atomic claim", () => {
    const worker = readSrc("src/lib/coaching/ai/run-coaching-generation-worker.ts");
    const store = readSrc("src/lib/coaching/ai/coaching-ai-store.ts");
    expect(worker).toContain("claimCoachingGenerationJobs");
    expect(store).toContain("claim_coaching_generation_jobs");
  });

  it("REL-08 queued>0 / claimed=0 is observable", () => {
    const worker = readSrc("src/lib/coaching/ai/run-coaching-generation-worker.ts");
    const route = readSrc("src/app/api/coaching/jobs/process/route.ts");
    expect(worker).toContain("countClaimableGenerationJobs");
    expect(worker).toContain("job_claim_empty");
    expect(worker).toContain("claimable_queued_but_claimed_0");
    expect(route).toContain("claimableQueued");
    expect(route).toContain("claimed_0_with_claimable_queued");
  });

  it("REL-09 AI fail → Layer1 remains independent", () => {
    const layer1 = readSrc("src/lib/coaching/immediate-daily-feedback.ts");
    expect(layer1).toMatch(/Never calls OpenAI|deterministic/i);
    const view = readSrc("src/components/coaching/CoachingDailyCompleteView.tsx");
    expect(view).toContain("今天的基本回饋已經完成，進階分析稍後再補上");
    expect(view).not.toContain("無法生成");
  });

  it("REL-10 recovery eventually upgrades Layer2 (kick after recover)", () => {
    const route = readSrc("src/app/api/coaching/portal/[token]/ai-output/route.ts");
    expect(route).toContain("recoverStalePendingCoachingAiOutput");
    expect(route).toContain("kickCoachingGenerationWorkerBestEffort");
  });

  it("REL-11 every claimed path has terminal state telemetry", () => {
    const process = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
    for (const stage of [
      "job_setup_started",
      "job_completed",
      "job_failed",
      "job_superseded",
      "job_retry_scheduled",
    ]) {
      expect(process).toContain(`stage: "${stage}"`);
    }
    const worker = readSrc("src/lib/coaching/ai/run-coaching-generation-worker.ts");
    expect(worker).toContain("worker_uncaught");
  });

  it("REL-12 no raw internal terminology to Customer", () => {
    const view = readSrc("src/components/coaching/CoachingDailyCompleteView.tsx");
    const labels = view.match(/const PROGRESS_LABELS[\s\S]*?\};/)?.[0] ?? "";
    expect(labels).not.toMatch(/pending|processing|queue_wait|job_failed|superseded/);
    expect(resolveCustomerFacingAiProgress("failed").activeStep).not.toBe("personalized_ready");
    expect(view).toContain("今天的基本回饋已經完成，進階分析稍後再補上");
  });

  it("lifecycle logger never accepts free-form health text fields", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logCoachingAiJobLifecycle({
      stage: "job_failed",
      job_id: "j1",
      output_id: "o1",
      enrollment_id: "e1",
      error_class: classifyCoachingAiError(new Error("OpenAI timeout abort")),
      reason: "permanent_failure",
    });
    expect(spy).toHaveBeenCalled();
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(payload.type).toBe("coaching_ai_job_lifecycle");
    expect(payload.error_class).toBe("timeout");
    expect(payload).not.toHaveProperty("customerNote");
    expect(payload).not.toHaveProperty("prompt");
    spy.mockRestore();
  });

  it("terminal invariant: active job and completed are ok", () => {
    expect(
      evaluateCoachingAiTerminalInvariant({ outputStatus: "completed", activeJobCount: 0 }),
    ).toEqual({ ok: true, kind: "terminal_completed" });
    expect(
      evaluateCoachingAiTerminalInvariant({ outputStatus: "processing", activeJobCount: 1 }),
    ).toEqual({ ok: true, kind: "active_job" });
  });
});
