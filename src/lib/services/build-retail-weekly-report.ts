import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
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

function isWithinWeek(
  transactionDate: ISODateString,
  weekStartDate: ISODateString,
  weekEndDate: ISODateString,
): boolean {
  return transactionDate >= weekStartDate && transactionDate <= weekEndDate;
}

function resolveMonthlyTotal(
  transactionTypeKey: string,
  typeConfig: (typeof DEFAULT_BUSINESS_RULES.retailTransactionTypes)[number],
  monthlyChallenge: MonthlyChallengeProgress,
  vp: VpResult,
): number | null {
  if (typeConfig.valueUnit === "VP") {
    const vpType = vp.byType.find((item) => item.transactionTypeKey === transactionTypeKey);
    return vpType ? vpType.totalVp : 0;
  }

  const criterion = monthlyChallenge.criteria.find(
    (item) => item.criterionKey === typeConfig.criterionKey,
  );
  return criterion ? criterion.currentValue : null;
}

function toLineItem(transaction: RetailTransaction, unit: "NTD" | "VP"): RetailReportLineItem {
  return {
    transactionId: transaction.id,
    customerName: transaction.customerName,
    amount: transaction.amount,
    unit,
    transactionDate: transaction.transactionDate,
  };
}

export interface BuildRetailWeeklyReportInput {
  memberId: EntityId;
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  transactions: RetailTransaction[];
  monthlyChallenge: MonthlyChallengeProgress;
  vp: VpResult;
}

/**
 * Assembles the retail house weekly share report from Engine outputs and source transactions.
 * Not a Business Engine — presentation assembly only; monthly totals come from Engine.
 */
export function buildRetailWeeklyReport(
  input: BuildRetailWeeklyReportInput,
): RetailWeeklyReport {
  const weekEndDate = input.referenceDate;
  const weekStartDate = shiftDate(input.referenceDate, -6);

  const memberMonthTransactions = input.transactions.filter(
    (transaction) =>
      transaction.memberId === input.memberId &&
      isInYearMonth(transaction.transactionDate, input.yearMonth),
  );

  const categories: RetailReportCategory[] = DEFAULT_BUSINESS_RULES.retailTransactionTypes.map(
    (typeConfig) => {
      const presentation = CATEGORY_PRESENTATION[typeConfig.key] ?? {
        title: typeConfig.label,
        icon: "•",
        unit: typeConfig.valueUnit,
      };

      const weeklyItems = memberMonthTransactions
        .filter(
          (transaction) =>
            transaction.transactionTypeKey === typeConfig.key &&
            isWithinWeek(transaction.transactionDate, weekStartDate, weekEndDate),
        )
        .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))
        .map((transaction) => toLineItem(transaction, presentation.unit));

      const weeklyTotal = weeklyItems.reduce((sum, item) => sum + item.amount, 0);
      const monthlyTotal = resolveMonthlyTotal(
        typeConfig.key,
        typeConfig,
        input.monthlyChallenge,
        input.vp,
      );

      return {
        transactionTypeKey: typeConfig.key,
        title: presentation.title,
        icon: presentation.icon,
        unit: presentation.unit,
        weeklyItems,
        weeklyTotal,
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
