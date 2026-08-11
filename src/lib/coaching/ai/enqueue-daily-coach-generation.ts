import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import {
  getCoachingAiOutputForDay,
  insertQueuedGenerationJob,
  listActiveGenerationJobsForOutput,
  upsertPendingCoachingAiOutput,
} from "@/lib/coaching/ai/coaching-ai-store";
import {
  planDailyCoachGenerationSubmit,
  resolveGenerationOutputMutation,
} from "@/lib/coaching/ai/coaching-generation-submit";
import { loadAuthoritativeCoachingGenerationInput } from "@/lib/coaching/ai/load-coaching-generation-context";

export type EnqueueDailyCoachGenerationResult =
  | { action: "skip"; reason: string }
  | { action: "enqueued"; outputId: string; jobId: string; fingerprint: string; reason: string };

/**
 * After a successful markSubmitted daily save: plan + upsert pending + enqueue.
 * Callers must catch errors — AI enqueue must never fail the daily submit API.
 */
export async function enqueueDailyCoachGenerationAfterSubmit(input: {
  enrollmentId: string;
  ownerMemberId: string;
  logDate: string;
}): Promise<EnqueueDailyCoachGenerationResult> {
  const loaded = await loadAuthoritativeCoachingGenerationInput(input);
  const fingerprint = fingerprintCoachingGenerationInput(loaded.generationInput);

  const existingOutput = await getCoachingAiOutputForDay({
    enrollmentId: loaded.enrollmentId,
    logDate: loaded.logDate,
  });

  const activeJobs = existingOutput
    ? await listActiveGenerationJobsForOutput(existingOutput.id)
    : [];

  const decision = planDailyCoachGenerationSubmit({
    fingerprint,
    existingOutput,
    activeJobs,
  });

  const mutation = resolveGenerationOutputMutation(decision, fingerprint);
  if (decision.action === "skip" || !mutation) {
    return { action: "skip", reason: decision.action === "skip" ? decision.reason : "denied" };
  }

  const output = await upsertPendingCoachingAiOutput({
    enrollmentId: loaded.enrollmentId,
    customerId: loaded.customerId,
    ownerMemberId: loaded.ownerMemberId,
    logDate: loaded.logDate,
    fingerprint,
    generationInput: loaded.generationInput,
    regenerationCount: mutation.regenerationCount,
  });

  const job = await insertQueuedGenerationJob({
    enrollmentId: loaded.enrollmentId,
    customerId: loaded.customerId,
    ownerMemberId: loaded.ownerMemberId,
    logDate: loaded.logDate,
    outputId: output.id,
    fingerprint,
  });

  return {
    action: "enqueued",
    outputId: output.id,
    jobId: job.id,
    fingerprint,
    reason: decision.reason,
  };
}
