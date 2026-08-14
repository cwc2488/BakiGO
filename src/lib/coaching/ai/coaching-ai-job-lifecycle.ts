/**
 * Coaching AI job lifecycle telemetry — IDs / stage / duration / safe error codes only.
 * Never logs PII, photo content, prompts, or health free text.
 */

export type CoachingAiJobLifecycleStage =
  | "job_enqueued"
  | "job_enqueue_skipped"
  | "job_claim_attempt"
  | "job_claimed"
  | "job_setup_started"
  | "job_context_loaded"
  | "job_vision_started"
  | "job_vision_completed"
  | "job_coach_started"
  | "job_coach_completed"
  | "job_persist_started"
  | "job_completed"
  | "job_failed"
  | "job_superseded"
  | "job_retry_scheduled"
  | "job_recovered"
  | "job_claim_empty"
  | "process_batch_summary";

export type CoachingAiJobLifecycleEvent = {
  type: "coaching_ai_job_lifecycle";
  stage: CoachingAiJobLifecycleStage;
  timestamp: string;
  job_id?: string | null;
  output_id?: string | null;
  enrollment_id?: string | null;
  daily_log_id?: string | null;
  log_date?: string | null;
  duration_ms?: number | null;
  error_class?: string | null;
  reason?: string | null;
  meta?: Record<string, string | number | boolean | null>;
};

/** Sanitize thrown messages into safe error classes (no free text). */
export function classifyCoachingAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  const lower = message.toLowerCase();
  if (lower.includes("abort") || lower.includes("timeout")) return "timeout";
  if (lower.includes("openai") || lower.includes("llm")) return "llm_upstream";
  if (lower.includes("fingerprint")) return "fingerprint";
  if (lower.includes("enrollment") || lower.includes("not found")) return "context_missing";
  if (lower.includes("photo") || lower.includes("storage") || lower.includes("download")) {
    return "photo_prepare";
  }
  if (lower.includes("json") || lower.includes("parse") || lower.includes("schema")) {
    return "parse_validation";
  }
  if (lower.includes("supabase") || lower.includes("database") || lower.includes("postgres")) {
    return "db";
  }
  // Keep short machine token only — strip free text.
  const token = message.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 64);
  return token || "generation_failed";
}

export function logCoachingAiJobLifecycle(
  event: Omit<CoachingAiJobLifecycleEvent, "type" | "timestamp"> & { timestamp?: string },
): CoachingAiJobLifecycleEvent {
  const payload: CoachingAiJobLifecycleEvent = {
    type: "coaching_ai_job_lifecycle",
    timestamp: event.timestamp ?? new Date().toISOString(),
    stage: event.stage,
    job_id: event.job_id ?? null,
    output_id: event.output_id ?? null,
    enrollment_id: event.enrollment_id ?? null,
    daily_log_id: event.daily_log_id ?? null,
    log_date: event.log_date ?? null,
    duration_ms: event.duration_ms ?? null,
    error_class: event.error_class ?? null,
    reason: event.reason ?? null,
    meta: event.meta,
  };
  console.info(JSON.stringify(payload));
  return payload;
}

/**
 * Terminal-state invariant for pending/processing outputs.
 * A = active queued/processing job
 * B = terminal failed/superseded/completed
 * C = recoverable orphan (no active job → requeue eligible)
 */
export type CoachingAiTerminalInvariant =
  | { ok: true; kind: "terminal_completed" | "terminal_failed" | "active_job" | "recoverable_orphan" }
  | { ok: false; kind: "unclassified_orphan"; reason: string };

export function evaluateCoachingAiTerminalInvariant(input: {
  outputStatus: string | null | undefined;
  activeJobCount: number;
}): CoachingAiTerminalInvariant {
  const status = input.outputStatus ?? null;
  if (status === "completed") return { ok: true, kind: "terminal_completed" };
  if (status === "failed") return { ok: true, kind: "terminal_failed" };
  if (status === "pending" || status === "processing") {
    if (input.activeJobCount > 0) return { ok: true, kind: "active_job" };
    return { ok: true, kind: "recoverable_orphan" };
  }
  if (!status) {
    return { ok: false, kind: "unclassified_orphan", reason: "missing_output" };
  }
  return { ok: false, kind: "unclassified_orphan", reason: `unexpected_status:${status}` };
}

/** Max recovery requeues per enrollment:logDate within process lifetime. */
export const COACHING_AI_RECOVERY_ATTEMPT_LIMIT = 8 as const;

const recoveryAttemptsByKey = new Map<string, number>();

export function getRecoveryAttemptCount(key: string): number {
  return recoveryAttemptsByKey.get(key) ?? 0;
}

export function incrementRecoveryAttempt(key: string): number {
  const next = (recoveryAttemptsByKey.get(key) ?? 0) + 1;
  recoveryAttemptsByKey.set(key, next);
  return next;
}

export function resetRecoveryAttemptCountsForTests(): void {
  recoveryAttemptsByKey.clear();
}

export function isRecoveryAttemptExhausted(key: string, limit = COACHING_AI_RECOVERY_ATTEMPT_LIMIT): boolean {
  return getRecoveryAttemptCount(key) >= limit;
}
