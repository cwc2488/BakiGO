/**
 * Enrollment journey window — presentation + Attention clamp helpers.
 * Does not change Outcome / Growth authority.
 */

export const COACHING_DEFAULT_JOURNEY_DAYS = 90;

/** Inclusive calendar span: start .. start+89 = 90 days. */
export function defaultPlannedEndDate(startDateIso: string): string {
  return addCalendarDays(startDateIso.slice(0, 10), COACHING_DEFAULT_JOURNEY_DAYS - 1);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  const yy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function resolveEnrollmentStartDate(startedAt: string | null | undefined): string | null {
  if (!startedAt) return null;
  const date = startedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function resolveEnrollmentPlannedEndDate(input: {
  startedAt: string | null | undefined;
  plannedEndAt?: string | null;
}): string | null {
  if (input.plannedEndAt && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedEndAt.slice(0, 10))) {
    return input.plannedEndAt.slice(0, 10);
  }
  const start = resolveEnrollmentStartDate(input.startedAt);
  if (!start) return null;
  return defaultPlannedEndDate(start);
}

/** Day 1 = start date. Outside window → null. */
export function coachingJourneyDayNumberInWindow(input: {
  startedAt: string | null | undefined;
  plannedEndAt?: string | null;
  logDate: string;
}): number | null {
  const start = resolveEnrollmentStartDate(input.startedAt);
  const end = resolveEnrollmentPlannedEndDate(input);
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(input.logDate)) return null;
  if (input.logDate < start || input.logDate > end) return null;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ly, lm, ld] = input.logDate.split("-").map(Number);
  const diff = Math.floor((Date.UTC(ly, lm - 1, ld) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
  return diff >= 1 ? diff : null;
}

export function coachingJourneyDayTotal(input: {
  startedAt: string | null | undefined;
  plannedEndAt?: string | null;
}): number {
  const start = resolveEnrollmentStartDate(input.startedAt);
  const end = resolveEnrollmentPlannedEndDate(input);
  if (!start || !end) return COACHING_DEFAULT_JOURNEY_DAYS;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  return Math.max(
    1,
    Math.floor((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1,
  );
}

export function isLogDateInEnrollmentWindow(input: {
  startedAt: string | null | undefined;
  plannedEndAt?: string | null;
  logDate: string;
}): boolean {
  return coachingJourneyDayNumberInWindow(input) != null;
}

/** Clamp dense calendar days to [start, end] inclusive. */
export function clampLogDatesToEnrollmentWindow(input: {
  startedAt: string | null | undefined;
  plannedEndAt?: string | null;
  logDates: string[];
}): string[] {
  const start = resolveEnrollmentStartDate(input.startedAt);
  const end = resolveEnrollmentPlannedEndDate(input);
  if (!start || !end) return input.logDates;
  return input.logDates.filter((d) => d >= start && d <= end);
}
