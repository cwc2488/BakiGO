import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import { isProvisionalGenerationFingerprint } from "@/lib/coaching/ai/enqueue-daily-coach-generation-fast";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { createCoachingAiProvider } from "@/lib/coaching/ai/coaching-ai-provider";
import {
  getCoachingAiOutputForDay,
  insertQueuedGenerationJob,
  markCoachingAiOutputCompleted,
  markCoachingAiOutputFailed,
  markCoachingAiOutputProcessing,
  markGenerationJobCompleted,
  markGenerationJobFailedOrRetry,
  markGenerationJobSuperseded,
  upsertPendingCoachingAiOutput,
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
import {
  createEmptyCoachingAiLatency,
  logCoachingAiLatency,
} from "@/lib/coaching/ai/coaching-ai-latency";
import {
  classifyCoachingAiError,
  logCoachingAiJobLifecycle,
} from "@/lib/coaching/ai/coaching-ai-job-lifecycle";
import { prepareCoachingMealImagesForGeneration } from "@/lib/coaching/ai/prepare-coaching-meal-images";
import { COACHING_AI_MEAL_IMAGE_FETCH_CONCURRENCY, COACHING_AI_PRIOR_PHOTO_HASH_MAX_IMAGES } from "@/lib/coaching/ai/coaching-meal-photo-constants";
import type { CoachingDailyLogDetail } from "@/types/coaching";
import {
  COACHING_GENERATION_MAX_ATTEMPTS,
  COACHING_GENERATION_RETRY_DELAYS_MS,
  type CoachingGenerationJobRecord,
} from "@/types/coaching-ai";
import type { CoachingFollowUpMemory } from "@/types/coaching-signals";

export type ProcessCoachingGenerationJobResult =
  | {
      outcome: "completed";
      latency?: import("@/lib/coaching/ai/coaching-ai-latency").CoachingAiLatencyTimestamps;
      breakdown?: import("@/lib/coaching/ai/coaching-ai-latency").CoachingAiLatencyBreakdownMs;
    }
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Reuse recentLogs from context load — no second listCoachingDailyLogs fetch. */
export async function loadPriorPhotoHashesFromRecentLogs(input: {
  recentLogs: CoachingDailyLogDetail[];
  logDate: string;
}): Promise<PriorMealPhotoHash[]> {
  try {
    const { downloadCoachingMealPhotoFromStorage } = await import(
      "@/lib/coaching/ai/coaching-meal-image-processor"
    );
    const { computeMealImageContentSha256, computeMealImagePhash } = await import(
      "@/lib/coaching/ai/detect-photo-reuse"
    );

    type WorkItem = {
      logDate: string;
      mealSlot: "breakfast" | "lunch" | "dinner";
      path: string;
    };
    const work: WorkItem[] = [];
    for (const log of input.recentLogs) {
      if (log.logDate >= input.logDate) continue;
      for (const meal of log.meals) {
        if (meal.mealSlot !== "breakfast" && meal.mealSlot !== "lunch" && meal.mealSlot !== "dinner") {
          continue;
        }
        const path = meal.photo?.storagePath;
        if (!path) continue;
        work.push({ logDate: log.logDate, mealSlot: meal.mealSlot, path });
      }
    }

    // Newest prior days first; cap downloads — reuse check does not need full history.
    work.sort((a, b) => b.logDate.localeCompare(a.logDate));
    const capped = work.slice(0, COACHING_AI_PRIOR_PHOTO_HASH_MAX_IMAGES);

    const hashed = await mapWithConcurrency(capped, COACHING_AI_MEAL_IMAGE_FETCH_CONCURRENCY, async (item) => {
      try {
        const buffer = await downloadCoachingMealPhotoFromStorage(item.path);
        return {
          logDate: item.logDate,
          mealSlot: item.mealSlot,
          contentSha256: computeMealImageContentSha256(buffer),
          phash: await computeMealImagePhash(buffer),
        } satisfies PriorMealPhotoHash;
      } catch {
        return null;
      }
    });
    return hashed.filter((item): item is PriorMealPhotoHash => item != null);
  } catch {
    return [];
  }
}

function lifecycleBase(job: CoachingGenerationJobRecord) {
  return {
    job_id: job.id,
    output_id: job.outputId,
    enrollment_id: job.enrollmentId,
    log_date: job.logDate,
  };
}

export async function processCoachingGenerationJob(
  job: CoachingGenerationJobRecord,
): Promise<ProcessCoachingGenerationJobResult> {
  const setupStartedAt = Date.now();
  logCoachingAiJobLifecycle({
    stage: "job_setup_started",
    ...lifecycleBase(job),
  });

  try {
    const latency = createEmptyCoachingAiLatency({
      job_created_at: job.createdAt ?? null,
      worker_started_at: new Date().toISOString(),
    });
    latency.context_load_started_at = new Date().toISOString();
    const loaded = await loadAuthoritativeCoachingGenerationInput({
      enrollmentId: job.enrollmentId,
      ownerMemberId: job.ownerMemberId,
      logDate: job.logDate,
    });
    latency.context_load_completed_at = new Date().toISOString();
    logCoachingAiJobLifecycle({
      stage: "job_context_loaded",
      ...lifecycleBase(job),
      daily_log_id: loaded.todayLog.id || null,
      duration_ms: Date.now() - setupStartedAt,
    });

    if (!loaded.todayLog.id) {
      await markGenerationJobSuperseded(job.id, "daily_log_missing_or_deleted");
      logCoachingAiJobLifecycle({
        stage: "job_superseded",
        ...lifecycleBase(job),
        reason: "daily_log_missing_or_deleted",
      });
      return { outcome: "superseded", reason: "daily_log_missing_or_deleted" };
    }

    const currentFingerprint = fingerprintCoachingGenerationInput(loaded.generationInput);

    // Provisional post-submit jobs: upgrade fingerprint in-place and continue (no supersede loop).
    if (isProvisionalGenerationFingerprint(job.inputFingerprint)) {
      const existing = await getCoachingAiOutputForDay({
        enrollmentId: job.enrollmentId,
        logDate: job.logDate,
      });
      await upsertPendingCoachingAiOutput({
        enrollmentId: loaded.enrollmentId,
        customerId: loaded.customerId,
        ownerMemberId: loaded.ownerMemberId,
        logDate: loaded.logDate,
        fingerprint: currentFingerprint,
        generationInput: loaded.generationInput,
        regenerationCount: existing?.regenerationCount ?? 0,
      });
      // Fall through using authoritative fingerprint / output.
    } else if (currentFingerprint !== job.inputFingerprint) {
      await markGenerationJobSuperseded(job.id, "fingerprint_stale_superseded");
      await upsertPendingCoachingAiOutput({
        enrollmentId: loaded.enrollmentId,
        customerId: loaded.customerId,
        ownerMemberId: loaded.ownerMemberId,
        logDate: loaded.logDate,
        fingerprint: currentFingerprint,
        generationInput: loaded.generationInput,
        regenerationCount: 0,
      });
      const refreshed = await getCoachingAiOutputForDay({
        enrollmentId: job.enrollmentId,
        logDate: job.logDate,
      });
      if (refreshed) {
        await insertQueuedGenerationJob({
          enrollmentId: job.enrollmentId,
          customerId: job.customerId,
          ownerMemberId: job.ownerMemberId,
          logDate: job.logDate,
          outputId: refreshed.id,
          fingerprint: currentFingerprint,
        });
      } else {
        logCoachingAiJobLifecycle({
          stage: "job_failed",
          ...lifecycleBase(job),
          error_class: "supersede_requeue_missing_output",
          reason: "fingerprint_stale_superseded_orphan",
        });
      }
      logCoachingAiJobLifecycle({
        stage: "job_superseded",
        ...lifecycleBase(job),
        reason: "fingerprint_stale_superseded_requeued",
        meta: { requeued: Boolean(refreshed) },
      });
      return { outcome: "superseded", reason: "fingerprint_stale_superseded_requeued" };
    }

    const outputRow = await getCoachingAiOutputForDay({
      enrollmentId: job.enrollmentId,
      logDate: job.logDate,
    });

    if (!outputRow || outputRow.id !== job.outputId) {
      await markGenerationJobSuperseded(job.id, "output_row_mismatch");
      if (outputRow && (outputRow.status === "pending" || outputRow.status === "processing")) {
        await insertQueuedGenerationJob({
          enrollmentId: job.enrollmentId,
          customerId: job.customerId,
          ownerMemberId: job.ownerMemberId,
          logDate: job.logDate,
          outputId: outputRow.id,
          fingerprint: outputRow.inputFingerprint || currentFingerprint,
        });
      }
      logCoachingAiJobLifecycle({
        stage: "job_superseded",
        ...lifecycleBase(job),
        reason: "output_row_mismatch_requeued",
        meta: { has_output_row: Boolean(outputRow) },
      });
      return { outcome: "superseded", reason: "output_row_mismatch_requeued" };
    }

    if (outputRow.status === "completed" && outputRow.inputFingerprint === currentFingerprint) {
      await markGenerationJobCompleted(job.id);
      logCoachingAiJobLifecycle({
        stage: "job_completed",
        ...lifecycleBase(job),
        reason: "already_completed_same_fingerprint",
        duration_ms: Date.now() - setupStartedAt,
      });
      return { outcome: "completed" };
    }

    if (outputRow.inputFingerprint !== currentFingerprint) {
      await markGenerationJobSuperseded(job.id, "output_fingerprint_advanced");
      await upsertPendingCoachingAiOutput({
        enrollmentId: loaded.enrollmentId,
        customerId: loaded.customerId,
        ownerMemberId: loaded.ownerMemberId,
        logDate: loaded.logDate,
        fingerprint: currentFingerprint,
        generationInput: loaded.generationInput,
        regenerationCount: outputRow.regenerationCount,
      });
      const refreshed = await getCoachingAiOutputForDay({
        enrollmentId: job.enrollmentId,
        logDate: job.logDate,
      });
      if (refreshed) {
        await insertQueuedGenerationJob({
          enrollmentId: job.enrollmentId,
          customerId: job.customerId,
          ownerMemberId: job.ownerMemberId,
          logDate: job.logDate,
          outputId: refreshed.id,
          fingerprint: currentFingerprint,
        });
      } else {
        logCoachingAiJobLifecycle({
          stage: "job_failed",
          ...lifecycleBase(job),
          error_class: "supersede_requeue_missing_output",
          reason: "output_fingerprint_advanced_orphan",
        });
      }
      logCoachingAiJobLifecycle({
        stage: "job_superseded",
        ...lifecycleBase(job),
        reason: "output_fingerprint_advanced_requeued",
        meta: { requeued: Boolean(refreshed) },
      });
      return { outcome: "superseded", reason: "output_fingerprint_advanced_requeued" };
    }

    await markCoachingAiOutputProcessing(outputRow.id);

    const todayLog = loaded.todayLog;
    latency.submitted_at = todayLog.submittedAt ?? null;

    latency.photo_prepare_started_at = new Date().toISOString();
    const todayHasMealPhotos = todayLog.meals.some(
      (meal) =>
        (meal.mealSlot === "breakfast" || meal.mealSlot === "lunch" || meal.mealSlot === "dinner") &&
        Boolean(meal.photo?.storagePath),
    );
    // P0.4: skip prior-hash work when today has no photos (reuse N/A).
    // When photos exist, keep prepare + prior hashes in parallel (wall = max).
    const [preparedImages, priorHashes] = todayHasMealPhotos
      ? await Promise.all([
          prepareCoachingMealImagesForGeneration({
            todayLog,
            enrollmentId: job.enrollmentId,
            customerId: job.customerId,
            logDate: job.logDate,
          }),
          loadPriorPhotoHashesFromRecentLogs({
            recentLogs: loaded.recentLogs,
            logDate: job.logDate,
          }),
        ])
      : [
          await prepareCoachingMealImagesForGeneration({
            todayLog,
            enrollmentId: job.enrollmentId,
            customerId: job.customerId,
            logDate: job.logDate,
          }),
          [] as Awaited<ReturnType<typeof loadPriorPhotoHashesFromRecentLogs>>,
        ];
    latency.photo_prepare_completed_at = new Date().toISOString();

    latency.vision_started_at = new Date().toISOString();
    logCoachingAiJobLifecycle({
      stage: "job_vision_started",
      ...lifecycleBase(job),
      daily_log_id: todayLog.id || null,
      meta: { prepared_image_count: preparedImages.prepared.length },
    });
    const { observations: mealObservations } = await observeCoachingMeals({
      generationInput: loaded.generationInput,
      preparedMealImages: preparedImages.prepared,
      ownerMemberId: job.ownerMemberId,
      persistTelemetry: true,
    });
    latency.vision_completed_at = new Date().toISOString();
    logCoachingAiJobLifecycle({
      stage: "job_vision_completed",
      ...lifecycleBase(job),
      duration_ms: Date.parse(latency.vision_completed_at) - Date.parse(latency.vision_started_at!),
    });

    const customerVoice = extractCustomerVoiceSignals(loaded.generationInput.todayContext.customerNote);
    const photoReuse = await detectCoachingPhotoReuse({
      preparedImages: preparedImages.prepared,
      priorHashes,
    });

    const pendingFollowUps: CoachingFollowUpMemory[] =
      loaded.generationInput.priorAiContext?.pendingFollowUps ?? [];

    latency.coach_generation_started_at = new Date().toISOString();
    logCoachingAiJobLifecycle({
      stage: "job_coach_started",
      ...lifecycleBase(job),
    });
    const decisionContext = buildCoachingDecisionContext({
      generationInput: loaded.generationInput,
      mealObservations,
      customerVoice,
      photoReuse,
      pendingFollowUps,
      structuredDirectives: loaded.activeStructuredDirectives,
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
    latency.coach_generation_completed_at = new Date().toISOString();
    logCoachingAiJobLifecycle({
      stage: "job_coach_completed",
      ...lifecycleBase(job),
      duration_ms:
        Date.parse(latency.coach_generation_completed_at) -
        Date.parse(latency.coach_generation_started_at!),
    });

    const outputJson = applyCoachingDecisionContextToOutput(result.output, decisionContext, {
      generationInput: loaded.generationInput,
    });

    latency.persist_started_at = new Date().toISOString();
    logCoachingAiJobLifecycle({
      stage: "job_persist_started",
      ...lifecycleBase(job),
    });
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
    latency.persist_completed_at = new Date().toISOString();
    latency.job_completed_at = latency.persist_completed_at;
    const breakdown = logCoachingAiLatency({
      enrollmentId: job.enrollmentId,
      logDate: job.logDate,
      jobId: job.id,
      timestamps: latency,
    });
    logCoachingAiJobLifecycle({
      stage: "job_completed",
      ...lifecycleBase(job),
      daily_log_id: todayLog.id || null,
      duration_ms: breakdown.worker_total_ms,
      reason: "generated",
    });
    return { outcome: "completed", latency, breakdown };
  } catch (error) {
    const errorClass = classifyCoachingAiError(error);
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
      logCoachingAiJobLifecycle({
        stage: "job_failed",
        ...lifecycleBase(job),
        error_class: errorClass,
        reason: "permanent_failure",
        duration_ms: Date.now() - setupStartedAt,
        meta: { attempt_count: job.attemptCount },
      });
      return { outcome: "failed", error: message };
    }

    logCoachingAiJobLifecycle({
      stage: "job_retry_scheduled",
      ...lifecycleBase(job),
      error_class: errorClass,
      reason: "retry_scheduled",
      duration_ms: Date.now() - setupStartedAt,
      meta: { attempt_count: job.attemptCount },
    });
    return { outcome: "retry_scheduled", attemptCount: job.attemptCount };
  }
}
