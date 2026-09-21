/**
 * Resolve independent batch limits for calendar vs 5＋5 push workers.
 * Vercel cron uses GET (no body) — must not share a single low default.
 */

export const DEFAULT_CALENDAR_PUSH_LIMIT = 80;
export const MAX_CALENDAR_PUSH_LIMIT = 200;

export const DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT = 1000;
export const MAX_FIVE_PLUS_FIVE_PUSH_LIMIT = 1000;

export type PushWorkerLimits = {
  calendarLimit: number;
  fivePlusFiveLimit: number;
};

/**
 * GET cron → calendar 80, fivePlusFive 1000.
 * POST with optional body.limit → calendar min(limit,200), fivePlusFive min(limit,1000).
 */
export function resolvePushWorkerLimits(input: {
  method: string;
  bodyLimit?: number;
}): PushWorkerLimits {
  const method = input.method.toUpperCase();

  if (method === "GET") {
    return {
      calendarLimit: DEFAULT_CALENDAR_PUSH_LIMIT,
      fivePlusFiveLimit: DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT,
    };
  }

  const raw =
    typeof input.bodyLimit === "number" && Number.isFinite(input.bodyLimit)
      ? Math.floor(input.bodyLimit)
      : null;

  if (raw === null || raw < 1) {
    return {
      calendarLimit: DEFAULT_CALENDAR_PUSH_LIMIT,
      fivePlusFiveLimit: DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT,
    };
  }

  return {
    calendarLimit: Math.max(1, Math.min(MAX_CALENDAR_PUSH_LIMIT, raw)),
    fivePlusFiveLimit: Math.max(1, Math.min(MAX_FIVE_PLUS_FIVE_PUSH_LIMIT, raw)),
  };
}
