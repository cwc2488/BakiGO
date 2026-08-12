import type { CoachingRecentDaySummary } from "@/lib/coaching/coaching-day-status";
import { listCoachingBackfillLogDates } from "@/lib/coaching/coaching-time";

/**
 * Sequential backfill order: 前天 → 昨天 → 今天.
 * Returns the next day that is still not_started or draft.
 */
export function nextIncompleteBackfillDate(
  recentDays: CoachingRecentDaySummary[],
  afterLogDate?: string | null,
  now: Date = new Date(),
): string | null {
  const order = listCoachingBackfillLogDates("Asia/Taipei", now);
  const startIndex = afterLogDate ? order.indexOf(afterLogDate) + 1 : 0;
  for (const logDate of order.slice(Math.max(0, startIndex))) {
    const day = recentDays.find((item) => item.logDate === logDate);
    if (!day || day.status === "not_started" || day.status === "draft") {
      return logDate;
    }
  }
  return null;
}

/** Next calendar day in backfill sequence after `afterLogDate` (may already be submitted). */
export function nextBackfillSequenceDate(
  afterLogDate: string,
  now: Date = new Date(),
): string | null {
  const order = listCoachingBackfillLogDates("Asia/Taipei", now);
  const index = order.indexOf(afterLogDate);
  if (index < 0 || index >= order.length - 1) {
    return null;
  }
  return order[index + 1] ?? null;
}

/**
 * CTA target after finishing a day in backfill mode:
 * prefer next incomplete day; otherwise advance to the next sequence day (e.g. 昨天→今天).
 */
export function resolveBackfillContinueTarget(input: {
  recentDays: CoachingRecentDaySummary[];
  afterLogDate: string;
  backfillActive: boolean;
  now?: Date;
}): { logDate: string; kind: "incomplete" | "sequence" } | null {
  const now = input.now ?? new Date();
  const incomplete = nextIncompleteBackfillDate(input.recentDays, input.afterLogDate, now);
  if (incomplete) {
    return { logDate: incomplete, kind: "incomplete" };
  }
  if (!input.backfillActive) {
    return null;
  }
  const sequence = nextBackfillSequenceDate(input.afterLogDate, now);
  if (!sequence) {
    return null;
  }
  return { logDate: sequence, kind: "sequence" };
}
