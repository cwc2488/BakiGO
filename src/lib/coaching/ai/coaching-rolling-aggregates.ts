import { countPrimaryMealsDone, isMealReported } from "@/lib/coaching/coaching-completion";
import {
  isLateBedtime,
  resolveSleepDurationMinutes,
} from "@/lib/coaching/coaching-sleep";
import {
  COACHING_RECENT_RAW_DAYS,
  COACHING_ROLLING_WINDOW_DAYS,
  type CoachingRollingAggregates,
  type CoachingRollingDaySummary,
  type CoachingRollingMemory,
} from "@/types/coaching-ai";
import {
  COACHING_MEAL_SLOT_LABELS,
  PRIMARY_MEAL_SLOTS,
  type CoachingDailyLogDetail,
  type CoachingMealSlot,
} from "@/types/coaching";

function mealForSlot(log: CoachingDailyLogDetail, slot: CoachingMealSlot) {
  return log.meals.find((meal) => meal.mealSlot === slot) ?? null;
}

function hasAnyReport(log: CoachingDailyLogDetail): boolean {
  const primaryDone = countPrimaryMealsDone(log.meals);
  return (
    Boolean(log.submittedAt) ||
    primaryDone > 0 ||
    log.waterMl != null ||
    Boolean(log.exerciseNote?.trim()) ||
    log.bowelMovementCount != null ||
    Boolean(log.sleepBedtime && log.sleepWakeTime) ||
    Boolean(log.sleepDuration?.trim()) ||
    Boolean(log.customerNote?.trim())
  );
}

export function buildCoachingRollingDaySummary(log: CoachingDailyLogDetail): CoachingRollingDaySummary {
  return {
    logDate: log.logDate,
    submitted: Boolean(log.submittedAt),
    primaryMealsDone: countPrimaryMealsDone(log.meals),
    primaryMealsTotal: PRIMARY_MEAL_SLOTS.length,
    breakfastReported: isMealReported(mealForSlot(log, "breakfast")),
    lunchReported: isMealReported(mealForSlot(log, "lunch")),
    dinnerReported: isMealReported(mealForSlot(log, "dinner")),
    waterMl: log.waterMl,
    sleepBedtime: log.sleepBedtime,
    sleepWakeTime: log.sleepWakeTime,
    sleepDurationMinutes: resolveSleepDurationMinutes({
      sleepDurationLabel: log.sleepDuration,
      sleepBedtime: log.sleepBedtime,
      sleepWakeTime: log.sleepWakeTime,
    }),
    exerciseReported: Boolean(log.exerciseNote?.trim()),
    bowelMovementCount: log.bowelMovementCount,
    customerNote: log.customerNote?.trim() || null,
  };
}

function completionRate(reportedDays: number, eligibleDays: number): number | null {
  if (eligibleDays <= 0) {
    return null;
  }
  return Math.round((reportedDays / eligibleDays) * 1000) / 1000;
}

function averageInt(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / values.length);
}

export function buildCoachingRollingAggregates(
  logs: CoachingDailyLogDetail[],
  windowDays = COACHING_ROLLING_WINDOW_DAYS,
): CoachingRollingAggregates {
  const windowLogs = logs.slice(0, windowDays);
  const daySummaries = windowLogs.map(buildCoachingRollingDaySummary);
  const daysWithReport = windowLogs.filter(hasAnyReport).length;
  const daysSubmitted = daySummaries.filter((day) => day.submitted).length;

  const eligibleMealDays = daySummaries.length;
  const mealReportDays = daySummaries.filter((day) => day.primaryMealsDone > 0).length;
  const breakfastDays = daySummaries.filter((day) => day.breakfastReported).length;
  const lunchDays = daySummaries.filter((day) => day.lunchReported).length;
  const dinnerDays = daySummaries.filter((day) => day.dinnerReported).length;

  const waterValues = daySummaries.map((day) => day.waterMl).filter((value): value is number => value != null);
  const sleepValues = daySummaries
    .map((day) => day.sleepDurationMinutes)
    .filter((value): value is number => value != null);

  const lateSleepDays = daySummaries.filter((day) => isLateBedtime(day.sleepBedtime)).length;
  const exerciseDays = daySummaries.filter((day) => day.exerciseReported).length;

  const bowelDays = daySummaries.filter((day) => day.bowelMovementCount != null);
  const bowelTotal = bowelDays.reduce((sum, day) => sum + (day.bowelMovementCount ?? 0), 0);

  return {
    windowDays,
    daysWithReport,
    daysSubmitted,
    mealReportRate: completionRate(mealReportDays, eligibleMealDays),
    breakfastCompletionRate: completionRate(breakfastDays, eligibleMealDays),
    lunchCompletionRate: completionRate(lunchDays, eligibleMealDays),
    dinnerCompletionRate: completionRate(dinnerDays, eligibleMealDays),
    averageWaterMl: averageInt(waterValues),
    averageSleepDurationMinutes: averageInt(sleepValues),
    lateSleepDays,
    exerciseDays,
    bowelMovementSummary: {
      daysReported: bowelDays.length,
      totalCount: bowelTotal,
      averagePerDay: bowelDays.length > 0 ? Math.round((bowelTotal / bowelDays.length) * 10) / 10 : null,
    },
  };
}

export function detectCoachingRecurringPatterns(aggregates: CoachingRollingAggregates): string[] {
  const patterns: string[] = [];

  if (aggregates.breakfastCompletionRate != null && aggregates.breakfastCompletionRate < 0.5) {
    patterns.push("breakfast_often_missed");
  }
  if (aggregates.lunchCompletionRate != null && aggregates.lunchCompletionRate < 0.5) {
    patterns.push("lunch_often_missed");
  }
  if (aggregates.dinnerCompletionRate != null && aggregates.dinnerCompletionRate < 0.5) {
    patterns.push("dinner_often_missed");
  }
  if (aggregates.lateSleepDays >= 3) {
    patterns.push("late_sleep_pattern");
  }
  if (aggregates.exerciseDays <= 1 && aggregates.daysWithReport >= 5) {
    patterns.push("exercise_infrequent");
  }
  if (aggregates.daysSubmitted > 0 && aggregates.daysSubmitted / Math.max(aggregates.windowDays, 1) < 0.5) {
    patterns.push("submission_inconsistent");
  }

  return patterns;
}

export function buildCoachingRollingMemory(
  logs: CoachingDailyLogDetail[],
  windowDays = COACHING_ROLLING_WINDOW_DAYS,
  recentRawDays = COACHING_RECENT_RAW_DAYS,
): CoachingRollingMemory {
  const sorted = [...logs].sort((left, right) => right.logDate.localeCompare(left.logDate));
  const aggregates = buildCoachingRollingAggregates(sorted, windowDays);
  const recentDays = sorted.slice(0, recentRawDays).map(buildCoachingRollingDaySummary);

  return {
    windowDays,
    aggregates,
    recentDays,
    recurringPatterns: detectCoachingRecurringPatterns(aggregates),
  };
}

export function primaryMealSlotLabel(slot: CoachingMealSlot): string {
  return COACHING_MEAL_SLOT_LABELS[slot];
}
