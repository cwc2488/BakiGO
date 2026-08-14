/**
 * Recover stale pending/processing coaching AI outputs that have no active job.
 * Never runs full generation inline — only requeue / reclaim / limbo repair.
 */

import {
  getCoachingAiOutputForDay,
  insertQueuedGenerationJob,
  listActiveGenerationJobsForOutput,
  markCoachingAiOutputFailed,
  markGenerationJobSuperseded,
  reclaimStaleCoachingGenerationJobs,
} from "@/lib/coaching/ai/coaching-ai-store";
import { loadAuthoritativeCoachingGenerationInput } from "@/lib/coaching/ai/load-coaching-generation-context";
import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import {
  getRecoveryAttemptCount,
  incrementRecoveryAttempt,
  isRecoveryAttemptExhausted,
  logCoachingAiJobLifecycle,
  resetRecoveryAttemptCountsForTests,
} from "@/lib/coaching/ai/coaching-ai-job-lifecycle";
import {
  COACHING_GENERATION_JOB_STALE_MS,
  type CoachingAiOutputRecord,
  type CoachingGenerationJobRecord,
} from "@/types/coaching-ai";

export { resetRecoveryAttemptCountsForTests };

/** Pending/processing without progress longer than this is eligible for recovery kick. */
export const COACHING_AI_STALE_PENDING_MS = 90_000 as const;

/** In-memory rate limit for portal recovery kicks (per enrollment+logDate). */
const recoveryKickAtByKey = new Map<string, number>();
export const COACHING_AI_RECOVERY_KICK_COOLDOWN_MS = 45_000 as const;

export type StalePendingRecoveryPlan =
  | { action: "noop"; reason: string }
  | { action: "reclaim_only"; reason: string }
  | { action: "requeue"; reason: string }
  | { action: "mark_failed"; reason: string; errorMessage: string }
  | { action: "supersede_stale_job"; reason: string; jobId: string };

export function planStalePendingRecovery(input: {
  output: Pick<
    CoachingAiOutputRecord,
    "id" | "status" | "inputFingerprint" | "updatedAt" | "startedAt" | "completedAt"
  > | null;
  activeJobs: Array<Pick<CoachingGenerationJobRecord, "id" | "status" | "inputFingerprint">>;
  nowMs: number;
  staleAfterMs?: number;
}): StalePendingRecoveryPlan {
  const staleAfterMs = input.staleAfterMs ?? COACHING_AI_STALE_PENDING_MS;
  const output = input.output;
  if (!output) {
    return { action: "noop", reason: "missing_output" };
  }
  if (output.status === "completed" || output.status === "failed") {
    return { action: "noop", reason: "terminal_output" };
  }
  if (output.status !== "pending" && output.status !== "processing") {
    return { action: "noop", reason: "not_pending_like" };
  }

  const anchor = Date.parse(output.updatedAt || output.startedAt || "");
  const ageMs = Number.isFinite(anchor) ? Math.max(0, input.nowMs - anchor) : staleAfterMs + 1;
  if (ageMs < staleAfterMs) {
    return { action: "noop", reason: "not_stale_yet" };
  }

  const matchingActive = input.activeJobs.filter(
    (job) => job.inputFingerprint === output.inputFingerprint,
  );
  if (matchingActive.length > 0) {
    return { action: "reclaim_only", reason: "active_job_exists" };
  }

  // Orphan pending/processing with no active job for current fingerprint.
  const foreignActive = input.activeJobs[0];
  if (foreignActive) {
    return {
      action: "supersede_stale_job",
      reason: "foreign_active_fingerprint",
      jobId: foreignActive.id,
    };
  }

  if (!output.inputFingerprint?.trim()) {
    return {
      action: "mark_failed",
      reason: "missing_fingerprint",
      errorMessage: "stale_pending_missing_fingerprint",
    };
  }

  return { action: "requeue", reason: "orphan_pending_no_active_job" };
}

export function shouldRateLimitRecoveryKick(input: {
  key: string;
  nowMs: number;
  cooldownMs?: number;
}): boolean {
  const cooldown = input.cooldownMs ?? COACHING_AI_RECOVERY_KICK_COOLDOWN_MS;
  const previous = recoveryKickAtByKey.get(input.key);
  if (previous == null) return false;
  return input.nowMs - previous < cooldown;
}

export function markRecoveryKick(input: { key: string; nowMs: number }): void {
  recoveryKickAtByKey.set(input.key, input.nowMs);
}

/** Test helper — clears rate-limit map. */
export function resetRecoveryKickRateLimitForTests(): void {
  recoveryKickAtByKey.clear();
}

export type RecoverStalePendingResult = {
  planned: StalePendingRecoveryPlan;
  requeuedJobId?: string;
  reclaimed?: number;
};

/**
 * Ensure pending/processing output is not permanently stuck without a live job.
 * Does not run LLM/vision.
 */
export async function recoverStalePendingCoachingAiOutput(input: {
  enrollmentId: string;
  ownerMemberId: string;
  customerId: string;
  logDate: string;
  nowMs?: number;
  staleAfterMs?: number;
}): Promise<RecoverStalePendingResult> {
  const nowMs = input.nowMs ?? Date.now();
  await reclaimStaleCoachingGenerationJobs(
    Math.max(1, Math.round(COACHING_GENERATION_JOB_STALE_MS / 60_000)),
  );

  const output = await getCoachingAiOutputForDay({
    enrollmentId: input.enrollmentId,
    logDate: input.logDate,
  });
  const activeJobs = output ? await listActiveGenerationJobsForOutput(output.id) : [];
  const planned = planStalePendingRecovery({
    output,
    activeJobs,
    nowMs,
    staleAfterMs: input.staleAfterMs,
  });

  if (planned.action === "noop") {
    return { planned };
  }

  const recoveryKey = `${input.enrollmentId}:${input.logDate}`;
  if (isRecoveryAttemptExhausted(recoveryKey)) {
    logCoachingAiJobLifecycle({
      stage: "job_failed",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: output?.id ?? null,
      error_class: "recovery_attempt_limit",
      reason: "recovery_exhausted",
      meta: { attempt_count: getRecoveryAttemptCount(recoveryKey) },
    });
    if (output && (output.status === "pending" || output.status === "processing")) {
      await markCoachingAiOutputFailed({
        outputId: output.id,
        errorMessage: "recovery_attempt_limit_exhausted",
      });
    }
    return {
      planned: {
        action: "mark_failed",
        reason: "recovery_attempt_limit",
        errorMessage: "recovery_attempt_limit_exhausted",
      },
    };
  }

  if (planned.action === "reclaim_only") {
    const reclaimed = await reclaimStaleCoachingGenerationJobs(
      Math.max(1, Math.round(COACHING_GENERATION_JOB_STALE_MS / 60_000)),
    );
    incrementRecoveryAttempt(recoveryKey);
    logCoachingAiJobLifecycle({
      stage: "job_recovered",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: output?.id ?? null,
      reason: planned.reason,
      meta: { action: "reclaim_only", reclaimed, attempt_count: getRecoveryAttemptCount(recoveryKey) },
    });
    return { planned, reclaimed };
  }

  if (planned.action === "supersede_stale_job") {
    await markGenerationJobSuperseded(planned.jobId, planned.reason);
  }

  if (planned.action === "mark_failed") {
    if (output) {
      await markCoachingAiOutputFailed({
        outputId: output.id,
        errorMessage: planned.errorMessage,
      });
    }
    incrementRecoveryAttempt(recoveryKey);
    logCoachingAiJobLifecycle({
      stage: "job_failed",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: output?.id ?? null,
      error_class: planned.errorMessage,
      reason: planned.reason,
    });
    return { planned };
  }

  // requeue (also after superseding foreign active job)
  if (!output) {
    return { planned: { action: "noop", reason: "missing_output" } };
  }

  let fingerprint = output.inputFingerprint;
  if (!fingerprint?.trim()) {
    const loaded = await loadAuthoritativeCoachingGenerationInput({
      enrollmentId: input.enrollmentId,
      ownerMemberId: input.ownerMemberId,
      logDate: input.logDate,
    });
    fingerprint = fingerprintCoachingGenerationInput(loaded.generationInput);
  }

  // Idempotency: if another active job appeared between plan and insert, do not double-enqueue.
  const activeAgain = await listActiveGenerationJobsForOutput(output.id);
  const matching = activeAgain.filter((job) => job.inputFingerprint === fingerprint);
  if (matching.length > 0) {
    logCoachingAiJobLifecycle({
      stage: "job_recovered",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: output.id,
      job_id: matching[0]?.id ?? null,
      reason: "idempotent_active_job_exists",
      meta: { action: "noop_after_race" },
    });
    return { planned: { action: "reclaim_only", reason: "idempotent_active_job_exists" } };
  }

  const job = await insertQueuedGenerationJob({
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
    ownerMemberId: input.ownerMemberId,
    logDate: input.logDate,
    outputId: output.id,
    fingerprint,
  });

  incrementRecoveryAttempt(recoveryKey);
  logCoachingAiJobLifecycle({
    stage: "job_recovered",
    enrollment_id: input.enrollmentId,
    log_date: input.logDate,
    output_id: output.id,
    job_id: job.id,
    reason: planned.reason,
    meta: {
      action: "requeue",
      attempt_count: getRecoveryAttemptCount(recoveryKey),
    },
  });

  return { planned: { action: "requeue", reason: planned.reason }, requeuedJobId: job.id };
}
