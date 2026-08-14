import {
  getCoachingAiOutputForDay,
  insertQueuedGenerationJob,
  listActiveGenerationJobsForOutput,
  upsertPendingCoachingAiOutput,
} from "@/lib/coaching/ai/coaching-ai-store";
import { logCoachingAiJobLifecycle } from "@/lib/coaching/ai/coaching-ai-job-lifecycle";
import { COACHING_AI_MAX_REGENERATIONS_PER_DAY } from "@/types/coaching-ai";
import type { CoachingGenerationInput } from "@/types/coaching-ai";

export const PROVISIONAL_GENERATION_FINGERPRINT_PREFIX = "defer:" as const;

export function isProvisionalGenerationFingerprint(fingerprint: string): boolean {
  return fingerprint.startsWith(PROVISIONAL_GENERATION_FINGERPRINT_PREFIX);
}

export function buildProvisionalGenerationFingerprint(input: {
  enrollmentId: string;
  logDate: string;
  submittedAt: string;
}): string {
  const submittedMs = Date.parse(input.submittedAt);
  const stamp = Number.isFinite(submittedMs) ? submittedMs : Date.now();
  return `${PROVISIONAL_GENERATION_FINGERPRINT_PREFIX}${input.enrollmentId}:${input.logDate}:${stamp}`;
}

export type FastEnqueueDailyCoachGenerationResult =
  | { action: "skip"; reason: string }
  | { action: "enqueued"; outputId: string; jobId: string; fingerprint: string; reason: string };

/**
 * Minimal enqueue for post-submit after():
 * create pending output + queued job WITHOUT loading AI generation context.
 * Worker upgrades provisional fingerprint to authoritative on claim.
 */
export async function enqueueDailyCoachGenerationFast(input: {
  enrollmentId: string;
  ownerMemberId: string;
  customerId: string;
  logDate: string;
  submittedAt: string;
}): Promise<FastEnqueueDailyCoachGenerationResult> {
  const fingerprint = buildProvisionalGenerationFingerprint(input);

  const existingOutput = await getCoachingAiOutputForDay({
    enrollmentId: input.enrollmentId,
    logDate: input.logDate,
  });

  const activeJobs = existingOutput
    ? await listActiveGenerationJobsForOutput(existingOutput.id)
    : [];

  if (activeJobs.length > 0) {
    logCoachingAiJobLifecycle({
      stage: "job_enqueue_skipped",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: existingOutput?.id ?? null,
      reason: "active_job_exists",
      meta: { active_job_count: activeJobs.length },
    });
    return { action: "skip", reason: "active_job_exists" };
  }

  if (
    existingOutput &&
    existingOutput.regenerationCount >= COACHING_AI_MAX_REGENERATIONS_PER_DAY &&
    existingOutput.status === "completed"
  ) {
    logCoachingAiJobLifecycle({
      stage: "job_enqueue_skipped",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: existingOutput.id,
      reason: "max_regenerations_reached",
    });
    return { action: "skip", reason: "max_regenerations_reached" };
  }

  if (
    existingOutput &&
    existingOutput.regenerationCount >= COACHING_AI_MAX_REGENERATIONS_PER_DAY &&
    !isProvisionalGenerationFingerprint(existingOutput.inputFingerprint)
  ) {
    logCoachingAiJobLifecycle({
      stage: "job_enqueue_skipped",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: existingOutput.id,
      reason: "max_regenerations_reached",
    });
    return { action: "skip", reason: "max_regenerations_reached" };
  }

  const regenerationCount =
    existingOutput && !isProvisionalGenerationFingerprint(existingOutput.inputFingerprint)
      ? existingOutput.regenerationCount + (existingOutput.status === "completed" ? 1 : 0)
      : existingOutput?.regenerationCount ?? 0;

  if (regenerationCount > COACHING_AI_MAX_REGENERATIONS_PER_DAY) {
    logCoachingAiJobLifecycle({
      stage: "job_enqueue_skipped",
      enrollment_id: input.enrollmentId,
      log_date: input.logDate,
      output_id: existingOutput?.id ?? null,
      reason: "max_regenerations_reached",
    });
    return { action: "skip", reason: "max_regenerations_reached" };
  }

  // Placeholder snapshot — worker replaces with authoritative input before generation.
  const placeholderInput = {
    version: "coaching_generation_input_v1",
    builtAt: input.submittedAt,
    logDate: input.logDate,
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
  } as unknown as CoachingGenerationInput;

  const output = await upsertPendingCoachingAiOutput({
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
    ownerMemberId: input.ownerMemberId,
    logDate: input.logDate,
    fingerprint,
    generationInput: placeholderInput,
    regenerationCount,
  });

  const job = await insertQueuedGenerationJob({
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
    ownerMemberId: input.ownerMemberId,
    logDate: input.logDate,
    outputId: output.id,
    fingerprint,
  });

  logCoachingAiJobLifecycle({
    stage: "job_enqueued",
    job_id: job.id,
    output_id: output.id,
    enrollment_id: input.enrollmentId,
    log_date: input.logDate,
    reason: "provisional_fast_enqueue",
  });

  return {
    action: "enqueued",
    outputId: output.id,
    jobId: job.id,
    fingerprint,
    reason: "provisional_fast_enqueue",
  };
}
