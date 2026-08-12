import { getCoachingAiOutputForDay } from "@/lib/coaching/ai/coaching-ai-store";
import {
  COACHING_DAY_UI_STATUS_LABELS,
  mapCoachingDayUiStatus,
  type CoachingRecentDaySummary,
} from "@/lib/coaching/coaching-day-status";
import { getCoachingDailyLogDetail } from "@/lib/coaching/coaching-service";
import {
  coachingLogDateOffset,
  coachingRelativeDayLabel,
  coachingTodayLogDate,
  formatCoachingShortDate,
  listCoachingRecentLogDates,
  relativeCoachingDayKey,
} from "@/lib/coaching/coaching-time";

export type { CoachingRecentDaySummary };

/** Inclusive day index from enrollment start date (YYYY-MM-DD) to logDate. */
export function coachingJourneyDayNumber(input: {
  enrollmentStartedAt: string | null | undefined;
  logDate: string;
}): number | null {
  if (!input.enrollmentStartedAt) {
    return null;
  }
  const startDate = input.enrollmentStartedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.logDate)) {
    return null;
  }
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ly, lm, ld] = input.logDate.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const log = Date.UTC(ly, lm - 1, ld);
  const diff = Math.floor((log - start) / 86_400_000) + 1;
  if (diff < 1 || diff > 90) {
    return diff < 1 ? null : Math.min(diff, 90);
  }
  return diff;
}

function extractFocusSummary(outputJson: {
  customer?: {
    tomorrow_focus?: string;
    adjustment_priorities?: string[];
  } | null;
} | null): string | null {
  const customer = outputJson?.customer;
  if (!customer) return null;
  const topPriority = customer.adjustment_priorities?.[0]?.trim();
  if (topPriority) return topPriority;
  const focus = customer.tomorrow_focus?.trim();
  return focus || null;
}

export async function listCoachingRecentDaySummaries(input: {
  enrollmentId: string;
  enrollmentStartedAt?: string | null;
  /** Defaults to the editable 3-day window. Larger values enable history expansion. */
  limit?: number;
}): Promise<CoachingRecentDaySummary[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 3, 90));
  const dates =
    limit <= 3
      ? listCoachingRecentLogDates()
      : Array.from({ length: limit }, (_, index) => coachingLogDateOffset(-index));

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

    const outputJson = aiOutput?.outputJson ?? null;
    const nutritionLabel =
      outputJson?.coach?.daily_nutrition_assessment?.label ??
      (outputJson?.coach?.daily_nutrition_assessment?.level
        ? String(outputJson.coach.daily_nutrition_assessment.level)
        : null);

    summaries.push({
      logDate,
      relativeKey: relativeCoachingDayKey(logDate),
      relativeLabel: coachingRelativeDayLabel(logDate),
      shortDate: formatCoachingShortDate(logDate),
      status,
      statusLabel: COACHING_DAY_UI_STATUS_LABELS[status],
      submittedAt: dailyLog.submittedAt ?? null,
      hasLog,
      dayNumber: coachingJourneyDayNumber({
        enrollmentStartedAt: input.enrollmentStartedAt,
        logDate,
      }),
      nutritionLabel,
      focusSummary: status === "ai_ready" ? extractFocusSummary(outputJson) : null,
    });
  }

  return summaries;
}

/** Convenience for future 90-day history without forcing portal context changes. */
export async function listCoachingHistoryDaySummaries(input: {
  enrollmentId: string;
  enrollmentStartedAt?: string | null;
  limit?: number;
}): Promise<CoachingRecentDaySummary[]> {
  return listCoachingRecentDaySummaries({
    enrollmentId: input.enrollmentId,
    enrollmentStartedAt: input.enrollmentStartedAt,
    limit: input.limit ?? 14,
  });
}

export function coachingHistoryWindowLabel(today = coachingTodayLogDate()): string {
  return `截至 ${formatCoachingShortDate(today)}`;
}
