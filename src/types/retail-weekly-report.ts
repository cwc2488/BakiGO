import type { ISODateString, YearMonth } from "@/types";

/** Single retail transaction line — never merged with others. */
export interface RetailReportLineItem {
  transactionId: string;
  customerName: string;
  amount: number;
  unit: "NTD" | "VP";
  transactionDate: ISODateString;
  note?: string;
}

export interface RetailReportCategory {
  transactionTypeKey: string;
  title: string;
  icon: string;
  unit: "NTD" | "VP";
  weeklyItems: RetailReportLineItem[];
  /** Sum of weeklyItems — computed when report is built. */
  weeklyTotal: number;
  /** From Monthly Challenge / VP Engine — null if Rule Missing. */
  monthlyTotal: number | null;
}

export interface RetailWeeklyReport {
  memberId: string;
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  weekStartDate: ISODateString;
  weekEndDate: ISODateString;
  categories: RetailReportCategory[];
  computedAt: string;
}
