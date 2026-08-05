import type { ISODateString } from "@/types";
import type { GoalKpiCategory } from "@/types/goal-center";
import { isDailyKpi } from "./kpi-mapping";

function parseReferenceDate(referenceDate: ISODateString): Date {
  return new Date(`${referenceDate}T12:00:00`);
}

function toISODate(date: Date): ISODateString {
  return date.toISOString().slice(0, 10);
}

function daysRemainingInMonth(referenceDate: ISODateString): number {
  const date = parseReferenceDate(referenceDate);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.max(1, daysInMonth - date.getDate() + 1);
}

function daysElapsedInMonth(referenceDate: ISODateString): number {
  return Math.max(1, parseReferenceDate(referenceDate).getDate());
}

export function computeTodayNeeded(
  referenceDate: ISODateString,
  remaining: number,
  kpiCategory: GoalKpiCategory,
): number | null {
  if (remaining <= 0) {
    return 0;
  }

  if (isDailyKpi(kpiCategory)) {
    return remaining;
  }

  if (kpiCategory === "daily_transaction") {
    return Math.ceil(remaining / daysRemainingInMonth(referenceDate));
  }

  const daysLeft = daysRemainingInMonth(referenceDate);
  return Math.ceil(remaining / daysLeft);
}

export function estimateCompletionDate(
  referenceDate: ISODateString,
  current: number,
  remaining: number,
  kpiCategory: GoalKpiCategory,
): ISODateString | null {
  if (remaining <= 0) {
    return referenceDate;
  }

  if (isDailyKpi(kpiCategory)) {
    return remaining > 0 ? referenceDate : null;
  }

  if (current <= 0) {
    return null;
  }

  const dailyRate = current / daysElapsedInMonth(referenceDate);
  if (dailyRate <= 0) {
    return null;
  }

  const daysNeeded = Math.ceil(remaining / dailyRate);
  const estimated = parseReferenceDate(referenceDate);
  estimated.setDate(estimated.getDate() + daysNeeded);
  return toISODate(estimated);
}
