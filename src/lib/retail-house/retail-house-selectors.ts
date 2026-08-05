import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type {
  RetailHouseQuadrantKey,
  RetailHouseQuadrantView,
  RetailHouseSnapshot,
} from "@/types/retail-house";
import type { RetailReportCategory } from "@/types/retail-weekly-report";

const QUADRANT_CONFIG: Record<
  RetailHouseQuadrantKey,
  {
    transactionTypeKey: string;
    title: string;
    presentationTitle: string;
    valueLabel: string;
    monthlyLabel: string;
  }
> = {
  new_customer: {
    transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    title: "本週新顧客",
    presentationTitle: "新顧客",
    valueLabel: "金額",
    monthlyLabel: "新顧客",
  },
  returning_customer: {
    transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    title: "本週續訂顧客",
    presentationTitle: "舊顧客",
    valueLabel: "金額",
    monthlyLabel: "舊顧客",
  },
  new_member: {
    transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    title: "本週新會員",
    presentationTitle: "新會員",
    valueLabel: "VP",
    monthlyLabel: "新會員",
  },
  returning_member: {
    transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
    title: "本週舊會員下點",
    presentationTitle: "舊會員",
    valueLabel: "VP",
    monthlyLabel: "舊會員",
  },
};

/** 簡報四象限：左上、右上、左下、右下 */
export const PRESENTATION_QUADRANT_LAYOUT: RetailHouseQuadrantKey[] = [
  "new_customer",
  "new_member",
  "returning_customer",
  "returning_member",
];

const QUADRANT_ORDER: RetailHouseQuadrantKey[] = [
  "new_customer",
  "new_member",
  "returning_customer",
  "returning_member",
];

function findCategory(
  categories: RetailReportCategory[],
  transactionTypeKey: string,
): RetailReportCategory | undefined {
  return categories.find((category) => category.transactionTypeKey === transactionTypeKey);
}

function buildQuadrantView(
  key: RetailHouseQuadrantKey,
  categories: RetailReportCategory[],
): RetailHouseQuadrantView {
  const config = QUADRANT_CONFIG[key];
  const category = findCategory(categories, config.transactionTypeKey);

  return {
    key,
    title: config.title,
    presentationTitle: config.presentationTitle,
    valueLabel: config.valueLabel,
    unit: category?.unit ?? (key.includes("member") ? "VP" : "NTD"),
    weeklyItems: category?.weeklyItems ?? [],
    monthlyLabel: config.monthlyLabel,
    monthlyTotal: category?.monthlyTotal ?? null,
  };
}

/**
 * Presentation snapshot for Retail House — reads Engine outputs only via retailWeeklyReport.
 */
export function buildRetailHouseSnapshot(
  metrics: MemberComputedMetrics,
): RetailHouseSnapshot {
  const report = metrics.retailWeeklyReport;

  return {
    memberId: report.memberId,
    referenceDate: report.referenceDate,
    yearMonth: report.yearMonth,
    weekStartDate: report.weekStartDate,
    weekEndDate: report.weekEndDate,
    quadrants: QUADRANT_ORDER.map((key) => buildQuadrantView(key, report.categories)),
    computedAt: report.computedAt,
  };
}
