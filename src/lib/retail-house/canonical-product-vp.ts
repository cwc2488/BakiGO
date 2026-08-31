/**
 * Canonical Product VP — Retail House authoritative aggregation.
 *
 * LEGACY reward 積分 (gamification) is a separate system and must never feed this.
 *
 * Product VP for a member + business month =
 *   sum of member VP transaction amounts (new_member_vp / returning_member_vp)
 * + sum of user-entered metadata.retailVp on customer NTD transactions
 *
 * Same records Retail House uses; same month key (YYYY-MM from transactionDate).
 */

import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { isInYearMonth, toYearMonth } from "@/lib/business-engine/utils";
import { resolveRetailVpFromTransaction } from "@/lib/retail-house/resolve-transaction-points";
import type { EntityId, YearMonth } from "@/types";
import type { RetailTransaction } from "@/types/retail-transaction";

const MEMBER_VP_TYPES = new Set<string>([
  RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
  RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
]);

export type ProductVpTransactionInput = Pick<
  RetailTransaction,
  "id" | "memberId" | "transactionDate" | "transactionTypeKey" | "amount" | "metadata"
> & {
  /** When present and "void", excluded (engine soft-void compatibility). */
  status?: "active" | "void";
};

/**
 * VP contribution of one Retail House transaction toward Product VP.
 * Returns 0 for non-contributing / void / invalid rows — never invents values.
 */
export function resolveProductVpContribution(transaction: ProductVpTransactionInput): number {
  if (transaction.status === "void") {
    return 0;
  }

  if (MEMBER_VP_TYPES.has(transaction.transactionTypeKey)) {
    const amount = transaction.amount;
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  }

  const retailVp = resolveRetailVpFromTransaction(transaction);
  return retailVp ?? 0;
}

export function calculateMonthlyProductVp(input: {
  memberId: EntityId;
  yearMonth: YearMonth;
  transactions: readonly ProductVpTransactionInput[];
}): number {
  return input.transactions.reduce((sum, transaction) => {
    if (transaction.memberId !== input.memberId) {
      return sum;
    }
    if (!isInYearMonth(transaction.transactionDate, input.yearMonth)) {
      return sum;
    }
    return sum + resolveProductVpContribution(transaction);
  }, 0);
}

/**
 * Batch Product VP for many members from one transaction list (org screens).
 * Avoids N separate Retail House page loads.
 */
export function calculateMonthlyProductVpByMemberIds(input: {
  memberIds: readonly EntityId[];
  yearMonth: YearMonth;
  transactions: readonly ProductVpTransactionInput[];
}): Map<EntityId, number> {
  const wanted = new Set(input.memberIds);
  const totals = new Map<EntityId, number>();
  for (const memberId of input.memberIds) {
    totals.set(memberId, 0);
  }

  for (const transaction of input.transactions) {
    if (!wanted.has(transaction.memberId)) {
      continue;
    }
    if (!isInYearMonth(transaction.transactionDate, input.yearMonth)) {
      continue;
    }
    const contribution = resolveProductVpContribution(transaction);
    if (contribution === 0) {
      continue;
    }
    totals.set(transaction.memberId, (totals.get(transaction.memberId) ?? 0) + contribution);
  }

  return totals;
}

/** Sum Product VP shown across Retail House month report categories (consistency check). */
export function sumRetailHouseMonthProductVp(categories: readonly {
  unit: "NTD" | "VP";
  monthlyTotal: number;
  periodPointsTotal: number;
}[]): number {
  return categories.reduce((sum, category) => {
    if (category.unit === "VP") {
      return sum + category.monthlyTotal;
    }
    return sum + category.periodPointsTotal;
  }, 0);
}

export function yearMonthFromReferenceDate(referenceDate: string): YearMonth {
  return toYearMonth(referenceDate as `${number}-${number}-${number}`);
}
