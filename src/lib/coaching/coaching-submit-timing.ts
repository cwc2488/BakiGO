/** Lightweight server timing for coaching submit critical path. */

export type CoachingSubmitTimingMs = {
  token_validation_ms: number;
  daily_log_upsert_ms: number;
  immediate_feedback_ms: number;
  photo_sign_ms: number;
  after_registration_ms: number;
  response_total_ms: number;
  /** Enqueue is scheduled after response — measured as registration only. */
  job_enqueue_scheduled: boolean;
};

export function createSubmitTimer() {
  const started = Date.now();
  let mark = started;

  return {
    lap(name: keyof Omit<CoachingSubmitTimingMs, "response_total_ms" | "job_enqueue_scheduled">): number {
      const now = Date.now();
      const ms = Math.max(0, now - mark);
      mark = now;
      void name;
      return ms;
    },
    sinceStart(): number {
      return Math.max(0, Date.now() - started);
    },
  };
}
