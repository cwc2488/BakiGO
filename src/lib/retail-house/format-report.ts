import type { RetailReportLineItem } from "@/types/retail-weekly-report";

export function formatReportAmount(amount: number, unit: "NTD" | "VP"): string {
  if (unit === "VP") {
    return `${amount.toLocaleString("zh-Hant")} VP`;
  }
  return `NT$${amount.toLocaleString("zh-Hant")}`;
}

export function formatReportPoints(points: number): string {
  return `${points.toLocaleString("zh-Hant")} VP`;
}

/** Retail house secondary value — always shown as VP (not gamification 點數). */
export function formatReportVp(vp: number): string {
  return formatReportPoints(vp);
}

export function formatReportDateRange(start: string, end: string): string {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("zh-Hant", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${formatter.format(startDate)} — ${formatter.format(endDate)}`;
}

export function formatReportYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

export function formatLineItem(item: RetailReportLineItem): string {
  return formatReportAmount(item.amount, item.unit);
}

export function formatTransactionDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("zh-Hant", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(parsed);
}
