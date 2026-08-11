import {
  COACHING_AI_MAX_REGENERATIONS_PER_DAY,
  COACHING_AI_POINT_KEY,
  COACHING_GENERATION_JOB_STALE_MS,
  type CoachingAiOutputRecord,
  type CoachingAiOutputStatus,
  type CoachingGenerationJobRecord,
  type CoachingGenerationJobStatus,
} from "@/types/coaching-ai";

export type CoachingGenerationSubmitDecision =
  | { action: "skip"; reason: "same_fingerprint_completed" | "same_fingerprint_in_flight" | "max_regenerations_reached" }
  | {
      action: "enqueue";
      reason: "initial" | "fingerprint_changed";
      nextRegenerationCount: number;
      resetOutputStatus: CoachingAiOutputStatus;
    };

export type CoachingGenerationJobEnqueueInput = {
  fingerprint: string;
  existingOutput: Pick<
    CoachingAiOutputRecord,
    "inputFingerprint" | "status" | "regenerationCount"
  > | null;
  activeJobs: Array<Pick<CoachingGenerationJobRecord, "inputFingerprint" | "status">>;
};

export function isActiveGenerationJobStatus(status: CoachingGenerationJobStatus): boolean {
  return status === "queued" || status === "processing";
}

export function hasActiveJobForFingerprint(
  jobs: Array<Pick<CoachingGenerationJobRecord, "inputFingerprint" | "status">>,
  fingerprint: string,
): boolean {
  return jobs.some((job) => job.inputFingerprint === fingerprint && isActiveGenerationJobStatus(job.status));
}

export function planDailyCoachGenerationSubmit(input: CoachingGenerationJobEnqueueInput): CoachingGenerationSubmitDecision {
  const { fingerprint, existingOutput, activeJobs } = input;

  if (existingOutput?.status === "completed" && existingOutput.inputFingerprint === fingerprint) {
    return { action: "skip", reason: "same_fingerprint_completed" };
  }

  if (hasActiveJobForFingerprint(activeJobs, fingerprint)) {
    return { action: "skip", reason: "same_fingerprint_in_flight" };
  }

  const fingerprintChanged =
    existingOutput != null && existingOutput.inputFingerprint !== fingerprint && existingOutput.inputFingerprint.length > 0;

  if (fingerprintChanged && existingOutput.regenerationCount >= COACHING_AI_MAX_REGENERATIONS_PER_DAY) {
    return { action: "skip", reason: "max_regenerations_reached" };
  }

  const nextRegenerationCount = fingerprintChanged ? existingOutput.regenerationCount + 1 : existingOutput?.regenerationCount ?? 0;

  return {
    action: "enqueue",
    reason: fingerprintChanged ? "fingerprint_changed" : "initial",
    nextRegenerationCount,
    resetOutputStatus: "pending",
  };
}

export function buildPendingOutputPatch(input: {
  fingerprint: string;
  regenerationCount: number;
}): Pick<CoachingAiOutputRecord, "inputFingerprint" | "status" | "regenerationCount" | "pointKey"> & {
  outputJson: null;
  model: null;
  promptVersion: null;
  errorMessage: null;
  aiProposedInterventionLevel: null;
  finalInterventionLevel: null;
  startedAt: null;
  completedAt: null;
} {
  return {
    pointKey: COACHING_AI_POINT_KEY,
    inputFingerprint: input.fingerprint,
    status: "pending",
    regenerationCount: input.regenerationCount,
    outputJson: null,
    model: null,
    promptVersion: null,
    errorMessage: null,
    aiProposedInterventionLevel: null,
    finalInterventionLevel: null,
    startedAt: null,
    completedAt: null,
  };
}

export function buildQueuedGenerationJob(input: {
  outputId: string;
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  logDate: string;
  fingerprint: string;
  availableAt?: string;
}): Omit<CoachingGenerationJobRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
    ownerMemberId: input.ownerMemberId,
    logDate: input.logDate,
    outputId: input.outputId,
    inputFingerprint: input.fingerprint,
    status: "queued",
    attemptCount: 0,
    availableAt: input.availableAt ?? new Date().toISOString(),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
  };
}

export function isStaleProcessingJob(
  job: Pick<CoachingGenerationJobRecord, "status" | "lockedAt">,
  nowMs: number,
  staleAfterMs = COACHING_GENERATION_JOB_STALE_MS,
): boolean {
  if (job.status !== "processing" || !job.lockedAt) {
    return false;
  }
  const lockedMs = Date.parse(job.lockedAt);
  if (!Number.isFinite(lockedMs)) {
    return false;
  }
  return nowMs - lockedMs > staleAfterMs;
}

export function shouldReclaimStaleProcessingJob(
  job: Pick<CoachingGenerationJobRecord, "status" | "lockedAt">,
  nowMs: number,
  staleAfterMs = COACHING_GENERATION_JOB_STALE_MS,
): boolean {
  return isStaleProcessingJob(job, nowMs, staleAfterMs);
}

export function buildStaleJobRecoveryPatch(nowIso: string): Pick<
  CoachingGenerationJobRecord,
  "status" | "lockedAt" | "lockedBy" | "availableAt"
> {
  return {
    status: "queued",
    lockedAt: null,
    lockedBy: null,
    availableAt: nowIso,
  };
}

export function buildFailedJobRetryPatch(input: {
  attemptCount: number;
  lastError: string;
  availableAt: string;
}): Pick<CoachingGenerationJobRecord, "status" | "attemptCount" | "lastError" | "availableAt" | "lockedAt" | "lockedBy"> {
  return {
    status: "queued",
    attemptCount: input.attemptCount + 1,
    lastError: input.lastError,
    availableAt: input.availableAt,
    lockedAt: null,
    lockedBy: null,
  };
}

export type GenerationOutputMutation = ReturnType<typeof buildPendingOutputPatch>;

/** Returns null when submit is denied — caller must not reset a completed output. */
export function resolveGenerationOutputMutation(
  decision: CoachingGenerationSubmitDecision,
  fingerprint: string,
): GenerationOutputMutation | null {
  if (decision.action === "skip") {
    return null;
  }

  return buildPendingOutputPatch({
    fingerprint,
    regenerationCount: decision.nextRegenerationCount,
  });
}

export function preservesCompletedOutputWhenDenied(
  existingOutput: Pick<CoachingAiOutputRecord, "status" | "inputFingerprint" | "regenerationCount"> | null,
  decision: CoachingGenerationSubmitDecision,
  mutation: GenerationOutputMutation | null,
): boolean {
  if (decision.action === "skip" && existingOutput?.status === "completed") {
    return mutation === null;
  }
  return true;
}
