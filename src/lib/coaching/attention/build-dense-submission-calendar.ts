import { COACHING_NON_REPORTING_POLICY } from "@/lib/coaching/attention/coach-attention-policy";
import { coachingLogDateOffset } from "@/lib/coaching/coaching-time";
import type { CoachingSubmissionDay } from "@/types/coaching-attention";

/**
 * Build a dense Asia/Taipei submission calendar for non-reporting.
 * Every day in the window is present; days without a submitted log are `submitted: false`.
 *
 * When enrollmentStartDate / enrollmentPlannedEndDate are provided, days outside
 * the inclusive journey window are omitted (never counted as missing).
 */
export function buildDenseSubmissionCalendar(input: {
  asOfLogDate: string;
  /** Inclusive window length ending at asOfLogDate. Default: policy rolling window. */
  windowDays?: number;
  logs: Array<{ logDate: string; submitted: boolean }>;
  /** Inclusive Day 1 — pre-start dates are not missing. */
  enrollmentStartDate?: string | null;
  /** Inclusive planned end — post-end dates are not missing. */
  enrollmentPlannedEndDate?: string | null;
}): CoachingSubmissionDay[] {
  const windowDays = input.windowDays ?? COACHING_NON_REPORTING_POLICY.rollingWindowDays;
  const submittedByDate = new Map<string, boolean>();
  for (const log of input.logs) {
    const prev = submittedByDate.get(log.logDate) === true;
    submittedByDate.set(log.logDate, prev || log.submitted);
  }

  const start = input.enrollmentStartDate?.slice(0, 10) ?? null;
  const end = input.enrollmentPlannedEndDate?.slice(0, 10) ?? null;

  const days: CoachingSubmissionDay[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const logDate = shiftFromAsOf(input.asOfLogDate, -offset);
    if (start && logDate < start) continue;
    if (end && logDate > end) continue;
    const submitted = submittedByDate.get(logDate) === true;
    days.push({
      logDate,
      submitted,
      presence: submittedByDate.has(logDate) ? "present" : "missing",
    });
  }
  return days;
}

function shiftFromAsOf(asOfLogDate: string, daysOffset: number): string {
  // Anchor asOf as "today" for offset math without depending on wall-clock now.
  const [year, month, day] = asOfLogDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + daysOffset);
  const y = anchor.getUTCFullYear();
  const m = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const d = String(anchor.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Test helper: same as buildDenseSubmissionCalendar but named for calendar scenarios. */
export function countConsecutiveMissingCompletedDays(input: {
  asOfLogDate: string;
  asOfHourTaipei: number;
  calendar: CoachingSubmissionDay[];
}): number {
  const policy = COACHING_NON_REPORTING_POLICY;
  const byDate = new Map(input.calendar.map((day) => [day.logDate, day.submitted]));
  const todaySubmitted = byDate.get(input.asOfLogDate) === true;
  const beforeGrace = input.asOfHourTaipei < policy.todayGraceHourTaipei;
  if (!todaySubmitted && beforeGrace) {
    return 0;
  }
  const startOffset = !todaySubmitted && !beforeGrace ? 0 : 1;
  let consecutive = 0;
  for (let offset = startOffset; offset < policy.rollingWindowDays + 2; offset += 1) {
    const date = shiftFromAsOf(input.asOfLogDate, -offset);
    const submitted = byDate.get(date);
    if (submitted === true) break;
    if (submitted === false) {
      consecutive += 1;
      continue;
    }
    // Sparse calendar without dense false → stop (should not happen with dense builder)
    break;
  }
  return consecutive;
}

/** Re-export for callers that already use coaching time helpers. */
export function denseCalendarWindowStart(asOfLogDate: string, windowDays = COACHING_NON_REPORTING_POLICY.rollingWindowDays): string {
  return shiftFromAsOf(asOfLogDate, -(windowDays - 1));
}

export function listDenseCalendarDates(asOfLogDate: string, windowDays = COACHING_NON_REPORTING_POLICY.rollingWindowDays): string[] {
  return Array.from({ length: windowDays }, (_, index) => shiftFromAsOf(asOfLogDate, -index));
}

// Keep coachingLogDateOffset import used for parity documentation in tests.
void coachingLogDateOffset;
