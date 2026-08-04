import type { BusinessRulesConfig } from "./rules";
import { DEFAULT_BUSINESS_RULES } from "./rules";
import type { CalculateRetailHouseInput, RetailHouseResult } from "./types";
import {
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
  isInYearMonth,
} from "./utils";

/**
 * Computes per–retail-house activity and transaction totals for one member.
 */
export function calculateRetailHouse(
  input: CalculateRetailHouseInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): RetailHouseResult {
  const memberActivities = filterActivitiesByMember(input.activities, input.memberId);
  const periodActivities = filterActivitiesByYearMonth(memberActivities, input.yearMonth);

  const memberTransactions = input.transactions.filter(
    (transaction) =>
      transaction.memberId === input.memberId &&
      isInYearMonth(transaction.transactionDate, input.yearMonth),
  );

  const houses = input.retailHouseKeys.map((retailHouseKey) => {
    const updateCount = periodActivities.filter(
      (activity) =>
        activity.activityKey === rules.retailHouse.updateActivityKey &&
        activity.retailHouseKey === retailHouseKey,
    ).length;

    const houseTransactions = memberTransactions.filter(
      (transaction) => transaction.retailHouseKey === retailHouseKey,
    );

    const transactionCount = houseTransactions.length;
    const totalAmount = houseTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );
    const currencyCode = houseTransactions[0]?.currencyCode ?? null;

    return {
      retailHouseKey,
      updateCount,
      transactionCount,
      totalAmount,
      currencyCode,
    };
  });

  return {
    memberId: input.memberId,
    yearMonth: input.yearMonth,
    houses,
  };
}
