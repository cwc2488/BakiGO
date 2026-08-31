import type { DailyActionMetricView } from "@/types/daily-action";

export type MonthlyActivityStatus = "not_started" | "in_progress" | "completed";

export interface MonthlyActivityProgressInput {
  yearMonth: string;
  monthlyConsultation: DailyActionMetricView;
  monthlyMeasurement: DailyActionMetricView;
}

export interface MonthlyActivityProgressView {
  yearMonth: string;
  monthLabel: string;
  consultation: DailyActionMetricView;
  measurement: DailyActionMetricView;
  status: MonthlyActivityStatus;
  completedVia: "consultation" | "measurement" | null;
  remainingHint: string | null;
  isRuleMissing: boolean;
}

function formatYearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  if (!year || !month) {
    return yearMonth;
  }
  return `${Number.parseInt(month, 10)} 月`;
}

function isCriterionMet(metric: DailyActionMetricView): boolean {
  return metric.target !== null && metric.current >= metric.target;
}

function remainingCount(metric: DailyActionMetricView): number | null {
  if (metric.target === null || metric.isRuleMissing) {
    return null;
  }
  return Math.max(0, metric.target - metric.current);
}

/**
 * Monthly activity uses OR logic per docs/BUSINESS_RULES.md:
 * 30 measurements OR 7 consultations satisfies the month.
 */
export function buildMonthlyActivityProgress(
  input: MonthlyActivityProgressInput,
): MonthlyActivityProgressView {
  const { monthlyConsultation, monthlyMeasurement, yearMonth } = input;
  const isRuleMissing =
    monthlyConsultation.isRuleMissing || monthlyMeasurement.isRuleMissing;

  const consultationMet = isCriterionMet(monthlyConsultation);
  const measurementMet = isCriterionMet(monthlyMeasurement);

  let status: MonthlyActivityStatus = "not_started";
  let completedVia: MonthlyActivityProgressView["completedVia"] = null;

  if (consultationMet || measurementMet) {
    status = "completed";
    if (consultationMet && measurementMet) {
      completedVia = consultationMet ? "consultation" : "measurement";
    } else {
      completedVia = consultationMet ? "consultation" : "measurement";
    }
  } else if (monthlyConsultation.current > 0 || monthlyMeasurement.current > 0) {
    status = "in_progress";
  }

  let remainingHint: string | null = null;
  if (status !== "completed" && !isRuleMissing) {
    const consultationRemaining = remainingCount(monthlyConsultation);
    const measurementRemaining = remainingCount(monthlyMeasurement);
    const parts: string[] = [];

    if (consultationRemaining !== null && consultationRemaining > 0) {
      parts.push(`${consultationRemaining} 個諮詢`);
    }
    if (measurementRemaining !== null && measurementRemaining > 0) {
      parts.push(`${measurementRemaining} 個量測`);
    }

    if (parts.length === 2) {
      remainingHint = `還差 ${parts[0]} 或 ${parts[1]}`;
    } else if (parts.length === 1) {
      remainingHint = `還差 ${parts[0]}`;
    }
  }

  return {
    yearMonth,
    monthLabel: formatYearMonthLabel(yearMonth),
    consultation: monthlyConsultation,
    measurement: monthlyMeasurement,
    status,
    completedVia,
    remainingHint,
    isRuleMissing,
  };
}

export function monthlyActivityStatusLabel(status: MonthlyActivityStatus): string {
  switch (status) {
    case "completed":
      return "已達成";
    case "in_progress":
      return "進行中";
    case "not_started":
      return "尚未啟動";
  }
}
