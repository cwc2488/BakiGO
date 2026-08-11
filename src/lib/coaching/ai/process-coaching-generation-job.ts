import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { createCoachingAiProvider } from "@/lib/coaching/ai/coaching-ai-provider";
import {
  getCoachingAiOutputForDay,
  markCoachingAiOutputCompleted,
  markCoachingAiOutputFailed,
  markCoachingAiOutputProcessing,
  markGenerationJobCompleted,
  markGenerationJobFailedOrRetry,
  markGenerationJobSuperseded,
} from "@/lib/coaching/ai/coaching-ai-store";
import { buildCoachingDecisionContext } from "@/lib/coaching/ai/coaching-signal-engine";
import { generateDailyCoachWithTelemetry } from "@/lib/coaching/ai/generate-daily-coach";
import { loadAuthoritativeCoachingGenerationInput } from "@/lib/coaching/ai/load-coaching-generation-context";
import { prepareCoachingMealImagesForGeneration } from "@/lib/coaching/ai/prepare-coaching-meal-images";
import { getCoachingDailyLogDetail } from "@/lib/coaching/coaching-service";
import {
  COACHING_GENERATION_MAX_ATTEMPTS,
  COACHING_GENERATION_RETRY_DELAYS_MS,
  type CoachingGenerationJobRecord,
} from "@/types/coaching-ai";

export type ProcessCoachingGenerationJobResult =
  | { outcome: "completed" }
  | { outcome: "superseded"; reason: string }
  | { outcome: "retry_scheduled"; attemptCount: number }
  | { outcome: "failed"; error: string };

function resolveRetryAvailableAt(attemptCount: number, nowMs: number): string | null {
  // attemptCount is post-claim count. First failure → index 0 (5s), second → index 1 (20s).
  const failureIndex = Math.max(0, attemptCount - 1);
  const delayMs = COACHING_GENERATION_RETRY_DELAYS_MS[failureIndex];
  if (delayMs == null) {
    return null;
  }
  return new Date(nowMs + delayMs).toISOString();
}

export async function processCoachingGenerationJob(
  job: CoachingGenerationJobRecord,
): Promise<ProcessCoachingGenerationJobResult> {
  try {
    const loaded = await loadAuthoritativeCoachingGenerationInput({
      enrollmentId: job.enrollmentId,
      ownerMemberId: job.ownerMemberId,
      logDate: job.logDate,
    });
    const currentFingerprint = fingerprintCoachingGenerationInput(loaded.generationInput);

    if (currentFingerprint !== job.inputFingerprint) {
      await markGenerationJobSuperseded(job.id, "fingerprint_stale_superseded");
      return { outcome: "superseded", reason: "fingerprint_stale_superseded" };
    }

    const outputRow = await getCoachingAiOutputForDay({
      enrollmentId: job.enrollmentId,
      logDate: job.logDate,
    });

    if (!outputRow || outputRow.id !== job.outputId) {
      await markGenerationJobSuperseded(job.id, "output_row_mismatch");
      return { outcome: "superseded", reason: "output_row_mismatch" };
    }

    if (outputRow.status === "completed" && outputRow.inputFingerprint === currentFingerprint) {
      await markGenerationJobCompleted(job.id);
      return { outcome: "completed" };
    }

    if (outputRow.inputFingerprint !== currentFingerprint) {
      await markGenerationJobSuperseded(job.id, "output_fingerprint_advanced");
      return { outcome: "superseded", reason: "output_fingerprint_advanced" };
    }

    await markCoachingAiOutputProcessing(outputRow.id);

    const todayLog = await getCoachingDailyLogDetail({
      enrollmentId: job.enrollmentId,
      logDate: job.logDate,
      ownerMemberId: job.ownerMemberId,
    });

    const preparedImages = await prepareCoachingMealImagesForGeneration({
      todayLog,
      enrollmentId: job.enrollmentId,
      customerId: job.customerId,
      logDate: job.logDate,
    });

    const decisionContext = buildCoachingDecisionContext({
      generationInput: loaded.generationInput,
      mealObservations: [],
    });
    const finalInterventionLevel = decisionContext.finalInterventionLevel;

    const provider = createCoachingAiProvider();
    const { result } = await generateDailyCoachWithTelemetry({
      provider,
      request: {
        generationInput: loaded.generationInput,
        preparedMealImages: preparedImages.prepared,
        finalInterventionLevel,
        decisionContext,
      },
      ownerMemberId: job.ownerMemberId,
      imageUsageMetadata: preparedImages.telemetry,
      persistTelemetry: true,
    });

    // Provider already applies decision context; re-apply for safety at persistence boundary.
    const outputJson = applyCoachingDecisionContextToOutput(result.output, decisionContext);

    await markCoachingAiOutputCompleted({
      outputId: outputRow.id,
      fingerprint: currentFingerprint,
      generationInput: loaded.generationInput,
      outputJson,
      model: result.model,
      promptVersion: result.promptVersion,
      finalInterventionLevel,
      aiProposedInterventionLevel: outputJson.coach.proposed_intervention_level,
    });
    await markGenerationJobCompleted(job.id);
    return { outcome: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation_failed";
    const nowMs = Date.now();
    const retryAt = resolveRetryAvailableAt(job.attemptCount, nowMs);
    const permanent = job.attemptCount >= COACHING_GENERATION_MAX_ATTEMPTS || retryAt == null;

    await markGenerationJobFailedOrRetry({
      jobId: job.id,
      attemptCount: job.attemptCount,
      lastError: message,
      availableAt: permanent ? null : retryAt,
      permanent,
    });

    if (permanent) {
      await markCoachingAiOutputFailed({
        outputId: job.outputId,
        errorMessage: message,
        expectedFingerprint: job.inputFingerprint,
      });
      return { outcome: "failed", error: message };
    }

    return { outcome: "retry_scheduled", attemptCount: job.attemptCount };
  }
}
