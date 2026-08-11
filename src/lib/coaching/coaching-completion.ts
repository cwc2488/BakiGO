import {
  PRIMARY_MEAL_SLOTS,
  type CoachingDailyLog,
  type CoachingMealEntryWithPhoto,
  type CoachingTodayStatus,
} from "@/types/coaching";

export function isMealReported(meal: CoachingMealEntryWithPhoto | null | undefined): boolean {
  if (!meal) {
    return false;
  }
  return Boolean(meal.textNote?.trim()) || Boolean(meal.photo);
}

export function countPrimaryMealsDone(meals: CoachingMealEntryWithPhoto[]): number {
  return PRIMARY_MEAL_SLOTS.filter((slot) => {
    const meal = meals.find((entry) => entry.mealSlot === slot);
    return isMealReported(meal);
  }).length;
}

function isSleepReported(log: CoachingDailyLog | null): boolean {
  return Boolean(log?.sleepBedtime?.trim() && log?.sleepWakeTime?.trim()) || Boolean(log?.sleepDuration?.trim());
}

export function buildCoachingTodayStatus(input: {
  enrollmentId: string;
  customerId: string;
  customerDisplayName: string;
  goal: string | null;
  logDate: string;
  log: CoachingDailyLog | null;
  meals: CoachingMealEntryWithPhoto[];
}): CoachingTodayStatus {
  const primaryMealsDone = countPrimaryMealsDone(input.meals);
  const log = input.log;
  const waterMl = log?.waterMl ?? null;
  const exerciseNote = log?.exerciseNote?.trim() || null;
  const bowelMovementCount = log?.bowelMovementCount ?? null;
  const sleepBedtime = log?.sleepBedtime ?? null;
  const sleepWakeTime = log?.sleepWakeTime ?? null;
  const sleepDuration = log?.sleepDuration ?? null;
  const isSubmitted = Boolean(log?.submittedAt);

  return {
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
    customerDisplayName: input.customerDisplayName,
    goal: input.goal,
    logDate: input.logDate,
    hasReport:
      isSubmitted ||
      primaryMealsDone > 0 ||
      waterMl != null ||
      isSleepReported(log) ||
      Boolean(exerciseNote) ||
      bowelMovementCount != null,
    isSubmitted,
    primaryMealsDone,
    primaryMealsTotal: PRIMARY_MEAL_SLOTS.length,
    waterMl,
    waterDone: waterMl != null,
    sleepDuration,
    sleepBedtime,
    sleepWakeTime,
    sleepDone: isSleepReported(log),
    exerciseNote,
    exerciseDone: Boolean(exerciseNote),
    bowelMovementCount,
  };
}

export function formatCoachingTodayStatusLine(status: CoachingTodayStatus): string {
  if (!status.hasReport) {
    return "今日尚未回報";
  }

  const parts = [`${status.primaryMealsDone}/${status.primaryMealsTotal} 餐`];
  parts.push(`水 ${status.waterDone ? "✓" : "—"}`);
  parts.push(`睡眠 ${status.sleepDone ? "✓" : "—"}`);
  parts.push(`運動 ${status.exerciseDone ? "✓" : "—"}`);
  return parts.join(" · ");
}

export function formatCoachingCoachDailySummary(status: CoachingTodayStatus): string[] {
  if (!status.hasReport && !status.isSubmitted) {
    return ["尚未回報"];
  }

  const lines = [`主要三餐 ${status.primaryMealsDone}/${status.primaryMealsTotal}`];
  lines.push(`水分 ${status.waterMl != null ? `${status.waterMl} ml` : "—"}`);

  if (status.sleepDuration) {
    lines.push(`睡眠 ${status.sleepDuration}`);
  } else if (status.sleepBedtime && status.sleepWakeTime) {
    lines.push(`睡眠 ${status.sleepBedtime} → ${status.sleepWakeTime}`);
  } else {
    lines.push("睡眠 —");
  }

  lines.push(`運動 ${status.exerciseDone ? "已填" : "—"}`);
  lines.push(`排便 ${status.bowelMovementCount != null ? `${status.bowelMovementCount} 次` : "—"}`);
  lines.push(status.isSubmitted ? "已送出" : "尚未送出");
  return lines;
}
