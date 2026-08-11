import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import type { RetailHouseDateRangePreset } from "@/lib/retail-house/retail-house-date-range";
import {
  isCustomerTransactionType,
  resolveTransactionPoints,
} from "@/lib/retail-house/resolve-transaction-points";
import type { VpResult } from "@/lib/business-engine/types";
import { isInYearMonth } from "@/lib/business-engine/utils";
import type { MonthlyChallengeProgress } from "@/types/monthly-challenge";
import type { RetailTransaction } from "@/types/retail-transaction";
import type {
  RetailReportCategory,
  RetailReportLineItem,
  RetailWeeklyReport,
} from "@/types/retail-weekly-report";
import type { EntityId, ISODateString, YearMonth } from "@/types";

const CATEGORY_PRESENTATION: Record<
  string,
  { title: string; icon: string; unit: "NTD" | "VP" }
> = {
  [RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD]: {
    title: "新顧客成交",
    icon: "👤",
    unit: "NTD",
  },
  [RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD]: {
    title: "舊顧客成交",
    icon: "🔁",
    unit: "NTD",
  },
  [RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP]: {
    title: "新會員",
    icon: "⭐",
    unit: "VP",
  },
  [RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP]: {
    title: "舊會員",
    icon: "💎",
    unit: "VP",
  },
};

function shiftDate(date: ISODateString, offsetDays: number): ISODateString {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + offsetDays);
  return parsed.toISOString().slice(0, 10) as ISODateString;
}

function isWithinRange(
  transactionDate: ISODateString,
  rangeStartDate: ISODateString,
  rangeEndDate: ISODateString,
): boolean {
  return transactionDate >= rangeStartDate && transactionDate <= rangeEndDate;
}

function toLineItem(transaction: RetailTransaction, unit: "NTD" | "VP"): RetailReportLineItem {
  const points = isCustomerTransactionType(transaction.transactionTypeKey)
    ? resolveTransactionPoints(transaction.transactionTypeKey)
    : undefined;

  return {
    transactionId: transaction.id,
    transactionTypeKey: transaction.transactionTypeKey,
    customerName: transaction.customerName,
    customerPhone:
      typeof transaction.metadata?.customerPhone === "string"
        ? transaction.metadata.customerPhone
        : undefined,
    amount: transaction.amount,
    unit,
    points,
    transactionDate: transaction.transactionDate,
    note: transaction.note,
  };
}

export interface BuildRetailWeeklyReportInput {
  memberId: EntityId;
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  transactions: RetailTransaction[];
  monthlyChallenge: MonthlyChallengeProgress;
  vp: VpResult;
  rangeStartDate?: ISODateString;
  rangeEndDate?: ISODateString;
  rangePreset?: RetailHouseDateRangePreset;
}

function resolveMonthlyTotal(
  transactionTypeKey: string,
  typeConfig: (typeof DEFAULT_BUSINESS_RULES.retailTransactionTypes)[number],
  monthlyChallenge: MonthlyChallengeProgress,
  vp: VpResult,
  memberMonthTransactions: RetailTransaction[],
): number {
  if (typeConfig.valueUnit === "VP") {
    const vpType = vp.byType.find((item) => item.transactionTypeKey === transactionTypeKey);
    return vpType ? vpType.totalVp : 0;
  }

  const criterion = monthlyChallenge.criteria.find(
    (item) => item.criterionKey === typeConfig.criterionKey,
  );
  if (criterion) {
    return criterion.currentValue;
  }

  return memberMonthTransactions
    .filter((transaction) => transaction.transactionTypeKey === transactionTypeKey)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

/**
 * Assembles the retail house weekly share report from Engine outputs and source transactions.
 * Not a Business Engine — presentation assembly only; monthly totals come from Engine.
 */
export function buildRetailWeeklyReport(
  input: BuildRetailWeeklyReportInput,
): RetailWeeklyReport {
  const periodEndDate = input.rangeEndDate ?? input.referenceDate;
  const periodStartDate =
    input.rangeStartDate ?? shiftDate(input.referenceDate, -6);
  const weekEndDate = periodEndDate;
  const weekStartDate = periodStartDate;
  const useEngineMonthlyTotals = (input.rangePreset ?? "week") === "month";

  const memberTransactions = input.transactions.filter(
    (transaction) => transaction.memberId === input.memberId,
  );

  const memberMonthTransactions = memberTransactions.filter((transaction) =>
    isInYearMonth(transaction.transactionDate, input.yearMonth),
  );

  const categories: RetailReportCategory[] = DEFAULT_BUSINESS_RULES.retailTransactionTypes.map(
    (typeConfig) => {
      const presentation = CATEGORY_PRESENTATION[typeConfig.key] ?? {
        title: typeConfig.label,
        icon: "•",
        unit: typeConfig.valueUnit,
      };

      const sourceTransactions = useEngineMonthlyTotals
        ? memberMonthTransactions
        : memberTransactions;

      const periodItems = sourceTransactions
        .filter(
          (transaction) =>
            transaction.transactionTypeKey === typeConfig.key &&
            isWithinRange(transaction.transactionDate, periodStartDate, periodEndDate),
        )
        .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))
        .map((transaction) => toLineItem(transaction, presentation.unit));

      const weeklyTotal = periodItems.reduce((sum, item) => sum + item.amount, 0);
      const periodPointsTotal = periodItems.reduce(
        (sum, item) => sum + (item.points ?? 0),
        0,
      );
      const monthlyTotal = useEngineMonthlyTotals
        ? resolveMonthlyTotal(
            typeConfig.key,
            typeConfig,
            input.monthlyChallenge,
            input.vp,
            memberMonthTransactions,
          )
        : weeklyTotal;

      return {
        transactionTypeKey: typeConfig.key,
        title: presentation.title,
        icon: presentation.icon,
        unit: presentation.unit,
        weeklyItems: periodItems,
        weeklyTotal,
        periodPointsTotal,
        monthlyTotal,
      };
    },
  );

  return {
    memberId: input.memberId,
    referenceDate: input.referenceDate,
    yearMonth: input.yearMonth,
    weekStartDate,
    weekEndDate,
    categories,
    computedAt: new Date().toISOString(),
  };
}
