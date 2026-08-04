import type { BusinessRulesConfig } from "./rules";
import { DEFAULT_BUSINESS_RULES } from "./rules";
import type { CalculateVpInput, VpResult } from "./types";
import { calculateVP, toLegacyVpResult } from "./vp";

/**
 * Computes VP totals from retail transactions for one member in a given month.
 * Delegates to VP Rule Engine — never calculates VP inline.
 */
export function calculateVp(
  input: CalculateVpInput,
  rules: BusinessRulesConfig = DEFAULT_BUSINESS_RULES,
): VpResult {
  const engineResult = calculateVP(
    {
      memberId: input.memberId,
      organizationId: "local-org",
      referenceDate: `${input.yearMonth}-01T00:00:00.000Z`,
      yearMonth: input.yearMonth,
      transactions: input.transactions.map((transaction, index) => ({
        id: `legacy-${input.memberId}-${index}-${transaction.transactionDate}`,
        memberId: transaction.memberId,
        transactionDate: transaction.transactionDate,
        transactionTypeKey: transaction.transactionTypeKey,
        amount: transaction.amount,
      })),
      members: [{ id: input.memberId }],
    },
    rules.vp,
  );

  return toLegacyVpResult(engineResult);
}
