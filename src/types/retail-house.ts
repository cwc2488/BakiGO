import type { ISODateString, YearMonth } from "@/types";
import type { RetailReportLineItem } from "@/types/retail-weekly-report";

export type RetailHouseQuadrantKey =
  | "new_customer"
  | "returning_customer"
  | "new_member"
  | "returning_member";

export interface RetailHouseQuadrantView {
  key: RetailHouseQuadrantKey;
  title: string;
  presentationTitle: string;
  valueLabel: string;
  unit: "NTD" | "VP";
  showPoints: boolean;
  weeklyItems: RetailReportLineItem[];
  monthlyLabel: string;
  monthlyTotal: number;
  periodPointsTotal: number;
}

export interface RetailHouseSnapshot {
  memberId: string;
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  weekStartDate: ISODateString;
  weekEndDate: ISODateString;
  quadrants: RetailHouseQuadrantView[];
  computedAt: string;
}
