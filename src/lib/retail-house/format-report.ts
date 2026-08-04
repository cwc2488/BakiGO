import type { RetailReportLineItem } from "@/types/retail-weekly-report";

export function formatReportAmount(amount: number, unit: "NTD" | "VP"): string {
  if (unit === "VP") {
    return `${amount.toLocaleString("zh-Hant")} VP`;
  }
  return `NT$${amount.toLocaleString("zh-Hant")}`;
}

export function formatReportDateRange(start: string, end: string): string {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("zh-Hant", {
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
