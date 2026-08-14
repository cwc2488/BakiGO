/**
 * Coaching AI latency instrumentation — structured logs / eval only.
 * Does not invent product KPIs; never blocks customer submit.
 */

export type CoachingAiLatencyTimestamps = {
  submitted_at: string | null;
  job_created_at: string | null;
  worker_started_at: string | null;
  context_load_started_at: string | null;
  context_load_completed_at: string | null;
  photo_prepare_started_at: string | null;
  photo_prepare_completed_at: string | null;
  vision_started_at: string | null;
  vision_completed_at: string | null;
  coach_generation_started_at: string | null;
  coach_generation_completed_at: string | null;
  persist_started_at: string | null;
  persist_completed_at: string | null;
  job_completed_at: string | null;
};

export type CoachingAiLatencyBreakdownMs = {
  submit_to_job_ms: number | null;
  queue_wait_ms: number | null;
  context_load_ms: number | null;
  photo_prepare_ms: number | null;
  vision_ms: number | null;
  coach_ms: number | null;
  persist_ms: number | null;
  worker_total_ms: number | null;
  submit_to_complete_ms: number | null;
};

export function createEmptyCoachingAiLatency(
  partial?: Partial<CoachingAiLatencyTimestamps>,
): CoachingAiLatencyTimestamps {
  return {
    submitted_at: null,
    job_created_at: null,
    worker_started_at: null,
    context_load_started_at: null,
    context_load_completed_at: null,
    photo_prepare_started_at: null,
    photo_prepare_completed_at: null,
    vision_started_at: null,
    vision_completed_at: null,
    coach_generation_started_at: null,
    coach_generation_completed_at: null,
    persist_started_at: null,
    persist_completed_at: null,
    job_completed_at: null,
    ...partial,
  };
}

function deltaMs(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, b - a);
}

export function computeCoachingAiLatencyBreakdown(
  timestamps: CoachingAiLatencyTimestamps,
): CoachingAiLatencyBreakdownMs {
  return {
    submit_to_job_ms: deltaMs(timestamps.submitted_at, timestamps.job_created_at),
    queue_wait_ms: deltaMs(timestamps.job_created_at, timestamps.worker_started_at),
    context_load_ms: deltaMs(timestamps.context_load_started_at, timestamps.context_load_completed_at),
    photo_prepare_ms: deltaMs(
      timestamps.photo_prepare_started_at,
      timestamps.photo_prepare_completed_at,
    ),
    vision_ms: deltaMs(timestamps.vision_started_at, timestamps.vision_completed_at),
    coach_ms: deltaMs(
      timestamps.coach_generation_started_at,
      timestamps.coach_generation_completed_at,
    ),
    persist_ms: deltaMs(timestamps.persist_started_at, timestamps.persist_completed_at),
    worker_total_ms: deltaMs(timestamps.worker_started_at, timestamps.job_completed_at),
    submit_to_complete_ms: deltaMs(timestamps.submitted_at, timestamps.job_completed_at),
  };
}

export function logCoachingAiLatency(input: {
  enrollmentId: string;
  logDate: string;
  jobId: string;
  timestamps: CoachingAiLatencyTimestamps;
}): CoachingAiLatencyBreakdownMs {
  const breakdown = computeCoachingAiLatencyBreakdown(input.timestamps);
  console.info(
    JSON.stringify({
      type: "coaching_ai_latency",
      enrollmentId: input.enrollmentId,
      logDate: input.logDate,
      jobId: input.jobId,
      ...input.timestamps,
      breakdown_ms: breakdown,
    }),
  );
  return breakdown;
}

/** Customer portal AI poll policy — keep submit UX snappy; poll only after save. */
export const COACHING_AI_CUSTOMER_POLL_INTERVAL_MS = 2_500 as const;
export const COACHING_AI_CUSTOMER_POLL_MAX_INTERVAL_MS = 5_000 as const;
export const COACHING_AI_HOME_SOFT_POLL_INTERVAL_MS = 5_000 as const;

export function nextCoachingAiPollIntervalMs(attemptIndex: number): number {
  const base = COACHING_AI_CUSTOMER_POLL_INTERVAL_MS;
  const stepped = base + attemptIndex * 500;
  return Math.min(COACHING_AI_CUSTOMER_POLL_MAX_INTERVAL_MS, stepped);
}

export type CoachingAiProgressStage = "received" | "analyzing" | "ready" | "unavailable";

export function resolveCoachingAiProgressStage(input: {
  submitted: boolean;
  aiStatus: string | null | undefined;
}): CoachingAiProgressStage {
  if (!input.submitted) return "received";
  if (input.aiStatus === "completed") return "ready";
  if (input.aiStatus === "failed") return "unavailable";
  if (input.aiStatus === "pending" || input.aiStatus === "processing" || !input.aiStatus) {
    return "analyzing";
  }
  return "analyzing";
}
