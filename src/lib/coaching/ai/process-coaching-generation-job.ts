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
import {
  detectCoachingPhotoReuse,
  type PriorMealPhotoHash,
} from "@/lib/coaching/ai/detect-photo-reuse";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { generateDailyCoachWithTelemetry } from "@/lib/coaching/ai/generate-daily-coach";
import { loadAuthoritativeCoachingGenerationInput } from "@/lib/coaching/ai/load-coaching-generation-context";
import { observeCoachingMeals } from "@/lib/coaching/ai/observe-coaching-meals";
import { prepareCoachingMealImagesForGeneration } from "@/lib/coaching/ai/prepare-coaching-meal-images";
import { getCoachingDailyLogDetail, listCoachingDailyLogsForEnrollment } from "@/lib/coaching/coaching-service";
import {
  COACHING_GENERATION_MAX_ATTEMPTS,
  COACHING_GENERATION_RETRY_DELAYS_MS,
  type CoachingGenerationJobRecord,
} from "@/types/coaching-ai";
import type { CoachingFollowUpMemory } from "@/types/coaching-signals";

export type ProcessCoachingGenerationJobResult =
  | { outcome: "completed" }
  | { outcome: "superseded"; reason: string }
  | { outcome: "retry_scheduled"; attemptCount: number }
  | { outcome: "failed"; error: string };

function resolveRetryAvailableAt(attemptCount: number, nowMs: number): string | null {
  const failureIndex = Math.max(0, attemptCount - 1);
  const delayMs = COACHING_GENERATION_RETRY_DELAYS_MS[failureIndex];
  if (delayMs == null) {
    return null;
  }
  return new Date(nowMs + delayMs).toISOString();
}

async function loadPriorPhotoHashes(input: {
  enrollmentId: string;
  ownerMemberId: string;
  logDate: string;
}): Promise<PriorMealPhotoHash[]> {
  try {
    const recentLogs = await listCoachingDailyLogsForEnrollment({
      enrollmentId: input.enrollmentId,
      ownerMemberId: input.ownerMemberId,
      limit: 14,
    });
    const { downloadCoachingMealPhotoFromStorage } = await import(
      "@/lib/coaching/ai/coaching-meal-image-processor"
    );
    const { computeMealImageContentSha256, computeMealImagePhash } = await import(
      "@/lib/coaching/ai/detect-photo-reuse"
    );

    const hashes: PriorMealPhotoHash[] = [];
    for (const log of recentLogs) {
      if (log.logDate >= input.logDate) continue;
      for (const meal of log.meals) {
        if (meal.mealSlot !== "breakfast" && meal.mealSlot !== "lunch" && meal.mealSlot !== "dinner") {
          continue;
        }
        const path = meal.photo?.storagePath;
        if (!path) continue;
        try {
          const buffer = await downloadCoachingMealPhotoFromStorage(path);
          hashes.push({
            logDate: log.logDate,
            mealSlot: meal.mealSlot,
            contentSha256: computeMealImageContentSha256(buffer),
            phash: await computeMealImagePhash(buffer),
          });
        } catch {
          // skip failed prior downloads
        }
      }
    }
    return hashes;
  } catch {
    return [];
  }
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

    const { observations: mealObservations } = await observeCoachingMeals({
      generationInput: loaded.generationInput,
      preparedMealImages: preparedImages.prepared,
      ownerMemberId: job.ownerMemberId,
      persistTelemetry: true,
    });

    const customerVoice = extractCustomerVoiceSignals(loaded.generationInput.todayContext.customerNote);

    const priorHashes = await loadPriorPhotoHashes({
      enrollmentId: job.enrollmentId,
      ownerMemberId: job.ownerMemberId,
      logDate: job.logDate,
    });
    const photoReuse = await detectCoachingPhotoReuse({
      preparedImages: preparedImages.prepared,
      priorHashes,
    });

    const pendingFollowUps: CoachingFollowUpMemory[] =
      loaded.generationInput.priorAiContext?.pendingFollowUps ?? [];

    const decisionContext = buildCoachingDecisionContext({
      generationInput: loaded.generationInput,
      mealObservations,
      customerVoice,
      photoReuse,
      pendingFollowUps,
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
