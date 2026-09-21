import {
  addCalendarDays,
  daysElapsedInMonthThrough,
  fivePlusFiveToday,
  getBusinessWeekRange,
  getMonthRange,
  isReportDateStillOpen,
} from "@/lib/five-plus-five/dates";
import { resolveFivePlusFiveTargets } from "@/lib/five-plus-five/rules";
import type {
  FivePlusFiveDayStatus,
  FivePlusFiveMyStats,
  FivePlusFivePeriodTotals,
  FivePlusFiveReportRow,
} from "@/types/five-plus-five";

export function sumPeriod(
  reports: FivePlusFiveReportRow[],
  start: string,
  end: string,
): FivePlusFivePeriodTotals {
  let fishPool = 0;
  let invitationFiveSteps = 0;
  for (const report of reports) {
    if (report.reportDate < start || report.reportDate > end) continue;
    fishPool += report.fishPoolCount;
    invitationFiveSteps += report.invitationFiveStepsCount;
  }
  return { fishPool, invitationFiveSteps };
}

export function sumAll(reports: FivePlusFiveReportRow[]): FivePlusFivePeriodTotals {
  return reports.reduce(
    (acc, report) => {
      acc.fishPool += report.fishPoolCount;
      acc.invitationFiveSteps += report.invitationFiveStepsCount;
      return acc;
    },
    { fishPool: 0, invitationFiveSteps: 0 },
  );
}

export function resolveDayStatus(input: {
  reportDate: string;
  report: FivePlusFiveReportRow | null | undefined;
  today: string;
  fishDailyTarget: number;
  now?: Date;
}): FivePlusFiveDayStatus {
  const { reportDate, report, today, fishDailyTarget } = input;
  const now = input.now ?? new Date();

  if (!report) {
    if (reportDate === today && isReportDateStillOpen(reportDate, now)) {
      return "not_yet_reported";
    }
    return "overdue_unreported";
  }

  if (reportDate === today) {
    return report.fishPoolCount >= fishDailyTarget
      ? "reported_fish_met"
      : "reported_fish_unmet";
  }

  if (!report.submittedOnTime) {
    return "backfill";
  }
  return "on_time_past";
}

export function dayStatusLabel(status: FivePlusFiveDayStatus): string {
  switch (status) {
    case "not_yet_reported":
      return "尚未回報";
    case "overdue_unreported":
      return "未回報";
    case "reported_fish_met":
      return "今日魚池達標";
    case "reported_fish_unmet":
      return "已回報・魚池未達標";
    case "backfill":
      return "補登";
    case "on_time_past":
      return "準時";
    default:
      return status;
  }
}

/**
 * 連續準時回報 streak.
 * - If today still open and no report yet: start from yesterday (do not zero early).
 * - If today closed and no report: streak = 0.
 * - Backfill (submitted_on_time=false) breaks the chain; does not repair streak.
 */
export function calculateOnTimeStreak(
  reports: FivePlusFiveReportRow[],
  today: string = fivePlusFiveToday(),
  now: Date = new Date(),
): number {
  const byDate = new Map(reports.map((r) => [r.reportDate, r]));
  const todayReport = byDate.get(today);
  const todayOpen = isReportDateStillOpen(today, now);

  let cursor: string;
  if (todayReport?.submittedOnTime) {
    cursor = today;
  } else if (todayOpen && !todayReport) {
    cursor = addCalendarDays(today, -1);
  } else if (!todayReport) {
    // Today closed without report → streak broken
    return 0;
  } else {
    // Today has late/backfill-style report (shouldn't happen for today, but safe)
    // or today report exists but not on time
    if (!todayReport.submittedOnTime) {
      return 0;
    }
    cursor = today;
  }

  let streak = 0;
  while (true) {
    const report = byDate.get(cursor);
    if (!report?.submittedOnTime) break;
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}

/** On-time days / elapsed calendar days in month through today. */
export function calculateMonthOnTimeRate(
  reports: FivePlusFiveReportRow[],
  today: string = fivePlusFiveToday(),
): { percent: number; onTimeDays: number; elapsedDays: number } {
  const { start } = getMonthRange(today);
  const elapsedDays = daysElapsedInMonthThrough(today);
  const onTimeDays = reports.filter(
    (r) => r.reportDate >= start && r.reportDate <= today && r.submittedOnTime,
  ).length;
  const percent =
    elapsedDays <= 0 ? 0 : Math.round((onTimeDays / elapsedDays) * 100);
  return { percent, onTimeDays, elapsedDays };
}

export function buildMyStats(input: {
  reports: FivePlusFiveReportRow[];
  todayReport: FivePlusFiveReportRow | null;
  today?: string;
  memberName: string;
  now?: Date;
}): FivePlusFiveMyStats {
  const today = input.today ?? fivePlusFiveToday(input.now);
  const now = input.now ?? new Date();
  const targets = resolveFivePlusFiveTargets();
  const week = getBusinessWeekRange(today);
  const month = getMonthRange(today);

  const weekTotals = sumPeriod(input.reports, week.start, week.end);
  const monthTotals = sumPeriod(input.reports, month.start, month.end);
  const history = sumAll(input.reports);
  const streak = calculateOnTimeStreak(input.reports, today, now);
  const onTime = calculateMonthOnTimeRate(input.reports, today);

  const todayFish = input.todayReport?.fishPoolCount ?? 0;
  const todayInvite = input.todayReport?.invitationFiveStepsCount ?? 0;
  const hasReport = Boolean(input.todayReport);

  return {
    today: {
      fishPool: todayFish,
      invitationFiveSteps: todayInvite,
      fishTarget: targets.fishPoolDaily,
      fishMet: hasReport && todayFish >= targets.fishPoolDaily,
      hasReport,
      status: resolveDayStatus({
        reportDate: today,
        report: input.todayReport,
        today,
        fishDailyTarget: targets.fishPoolDaily,
        now,
      }),
      submittedOnTime: input.todayReport?.submittedOnTime ?? null,
      firstSubmittedAt: input.todayReport?.firstSubmittedAt ?? null,
    },
    week: {
      ...weekTotals,
      fishTarget: targets.fishPoolWeekly,
      invitationTarget: targets.invitationFiveStepsWeekly,
      fishMet: weekTotals.fishPool >= targets.fishPoolWeekly,
      invitationMet: weekTotals.invitationFiveSteps >= targets.invitationFiveStepsWeekly,
      weekStart: week.start,
      weekEnd: week.end,
    },
    month: monthTotals,
    history,
    streakOnTimeDays: streak,
    monthOnTimeRatePercent: onTime.percent,
    monthOnTimeDays: onTime.onTimeDays,
    monthElapsedDays: onTime.elapsedDays,
    targets,
    todayDate: today,
    memberName: input.memberName,
  };
}
