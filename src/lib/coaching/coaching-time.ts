const COACHING_TIMEZONE = "Asia/Taipei";

/** Customer portal / coach quick switch: today and the prior 2 calendar days (Taipei). */
export const COACHING_RECENT_LOG_DAY_WINDOW = 3 as const;

export type CoachingRelativeDayKey = "today" | "yesterday" | "day_before_yesterday";

export function coachingTimezoneLabel(): string {
  return COACHING_TIMEZONE;
}

export function coachingTodayLogDate(timeZone = COACHING_TIMEZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

/**
 * Calendar date in Asia/Taipei shifted by `daysOffset` from today.
 * Negative = past (e.g. -1 = yesterday).
 */
export function coachingLogDateOffset(
  daysOffset: number,
  timeZone = COACHING_TIMEZONE,
  now: Date = new Date(),
): string {
  // Work in the target TZ by formatting parts, then shifting via UTC noon anchor.
  const today = coachingTodayLogDate(timeZone, now);
  const [year, month, day] = today.split("-").map((part) => Number(part));
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + daysOffset);
  const y = anchor.getUTCFullYear();
  const m = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const d = String(anchor.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Newest → oldest: [today, yesterday, day_before_yesterday]. */
export function listCoachingRecentLogDates(
  timeZone = COACHING_TIMEZONE,
  now: Date = new Date(),
): string[] {
  return Array.from({ length: COACHING_RECENT_LOG_DAY_WINDOW }, (_, index) =>
    coachingLogDateOffset(-index, timeZone, now),
  );
}

/** Oldest → newest for sequential backfill: [前天, 昨天, 今天]. */
export function listCoachingBackfillLogDates(
  timeZone = COACHING_TIMEZONE,
  now: Date = new Date(),
): string[] {
  return listCoachingRecentLogDates(timeZone, now).slice().reverse();
}

export function isAllowedCoachingLogDate(
  logDate: string,
  timeZone = COACHING_TIMEZONE,
  now: Date = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return false;
  }
  return listCoachingRecentLogDates(timeZone, now).includes(logDate);
}

export function relativeCoachingDayKey(
  logDate: string,
  timeZone = COACHING_TIMEZONE,
  now: Date = new Date(),
): CoachingRelativeDayKey | null {
  const recent = listCoachingRecentLogDates(timeZone, now);
  if (logDate === recent[0]) return "today";
  if (logDate === recent[1]) return "yesterday";
  if (logDate === recent[2]) return "day_before_yesterday";
  return null;
}

export function coachingRelativeDayLabel(
  logDate: string,
  timeZone = COACHING_TIMEZONE,
  now: Date = new Date(),
): string {
  const key = relativeCoachingDayKey(logDate, timeZone, now);
  if (key === "today") return "今天";
  if (key === "yesterday") return "昨天";
  if (key === "day_before_yesterday") return "前天";
  return formatCoachingShortDate(logDate);
}

export function formatCoachingShortDate(logDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(logDate);
  if (!match) return logDate;
  return `${Number(match[2])}/${Number(match[3])}`;
}

export function coachingDaySpeechLabel(
  logDate: string,
  timeZone = COACHING_TIMEZONE,
  now: Date = new Date(),
): string {
  const key = relativeCoachingDayKey(logDate, timeZone, now);
  if (key === "today") return "今天";
  if (key === "yesterday") return "昨天";
  if (key === "day_before_yesterday") return "前天";
  return formatCoachingShortDate(logDate);
}
