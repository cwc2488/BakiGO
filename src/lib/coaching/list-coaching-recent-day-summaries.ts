import { getCoachingAiOutputForDay } from "@/lib/coaching/ai/coaching-ai-store";
import {
  COACHING_DAY_UI_STATUS_LABELS,
  mapCoachingDayUiStatus,
  type CoachingRecentDaySummary,
} from "@/lib/coaching/coaching-day-status";
import { getCoachingDailyLogDetail } from "@/lib/coaching/coaching-service";
import {
  coachingRelativeDayLabel,
  formatCoachingShortDate,
  listCoachingRecentLogDates,
  relativeCoachingDayKey,
} from "@/lib/coaching/coaching-time";

export type { CoachingRecentDaySummary };

export async function listCoachingRecentDaySummaries(input: {
  enrollmentId: string;
}): Promise<CoachingRecentDaySummary[]> {
  const dates = listCoachingRecentLogDates();
  const summaries: CoachingRecentDaySummary[] = [];

  for (const logDate of dates) {
    const dailyLog = await getCoachingDailyLogDetail({
      enrollmentId: input.enrollmentId,
      logDate,
    });
    const hasLog = Boolean(dailyLog.id);
    const aiOutput =
      hasLog && dailyLog.submittedAt
        ? await getCoachingAiOutputForDay({
            enrollmentId: input.enrollmentId,
            logDate,
          })
        : null;

    const status = mapCoachingDayUiStatus({
      hasLog,
      submittedAt: dailyLog.submittedAt ?? null,
      aiStatus: aiOutput?.status ?? "missing",
    });

    summaries.push({
      logDate,
      relativeKey: relativeCoachingDayKey(logDate),
      relativeLabel: coachingRelativeDayLabel(logDate),
      shortDate: formatCoachingShortDate(logDate),
      status,
      statusLabel: COACHING_DAY_UI_STATUS_LABELS[status],
      submittedAt: dailyLog.submittedAt ?? null,
      hasLog,
    });
  }

  return summaries;
}
