/**
 * Same-day delete → resubmit reuses the physical coaching_ai_outputs row
 * (unique is enrollment_id, log_date, point_key). Safe only when the new
 * cycle resets generated content and an old in-flight job cannot persist.
 */

export type CoachingAiOutputPendingReset = {
  outputJson: null;
  status: "pending";
  deletedAt: null;
  deletedBy: null;
  errorMessage: null;
  model: null;
  promptVersion: null;
  startedAt: null;
  completedAt: null;
};

export function buildAiOutputPendingResetForNewCycle(): CoachingAiOutputPendingReset {
  return {
    outputJson: null,
    status: "pending",
    deletedAt: null,
    deletedBy: null,
    errorMessage: null,
    model: null,
    promptVersion: null,
    startedAt: null,
    completedAt: null,
  };
}

export type PersistGenerationCycleInput = {
  sourceDailyLogId: string;
  activeDailyLogId: string;
  jobStatus: string;
  outputId: string | null;
  jobOutputId: string;
  outputFingerprint: string | null;
  persistFingerprint: string;
};

export type PersistGenerationCycleDecision =
  | { persist: true }
  | { persist: false; reason: string };

/** Old job A must not complete into daily-log cycle B. */
export function decidePersistGenerationForActiveCycle(
  input: PersistGenerationCycleInput,
): PersistGenerationCycleDecision {
  if (!input.activeDailyLogId) {
    return { persist: false, reason: "daily_log_missing_or_deleted" };
  }
  if (input.activeDailyLogId !== input.sourceDailyLogId) {
    return { persist: false, reason: "daily_log_cycle_changed" };
  }
  if (input.jobStatus !== "processing") {
    return { persist: false, reason: "job_no_longer_active" };
  }
  if (!input.outputId || input.outputId !== input.jobOutputId) {
    return { persist: false, reason: "output_row_mismatch" };
  }
  if (!input.outputFingerprint || input.outputFingerprint !== input.persistFingerprint) {
    return { persist: false, reason: "output_fingerprint_mismatch" };
  }
  return { persist: true };
}

export function deletedAiTextCanLeakIntoReadyPoll(input: {
  status: string;
  outputJson: unknown;
}): boolean {
  return input.status === "completed" && input.outputJson != null;
}
