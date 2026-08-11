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

  return {
    enrollmentId: input.enrollmentId,
    customerId: input.customerId,
    customerDisplayName: input.customerDisplayName,
    goal: input.goal,
    logDate: input.logDate,
    hasReport: Boolean(input.log?.submittedAt) || primaryMealsDone > 0 || Boolean(input.log?.waterMl) || Boolean(input.log?.sleepDuration) || Boolean(input.log?.exerciseNote),
    primaryMealsDone,
    primaryMealsTotal: PRIMARY_MEAL_SLOTS.length,
    waterDone: input.log?.waterMl != null,
    sleepDone: Boolean(input.log?.sleepDuration?.trim()),
    exerciseDone: Boolean(input.log?.exerciseNote?.trim()),
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
