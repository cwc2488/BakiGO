import { DEFAULT_GAMIFICATION_RULES, GAMIFICATION_EVENT_SOURCES } from "@/lib/business-engine/rules/gamification";

/**
 * Resolves retail VP entered by the user on customer (NTD) transactions.
 * Stored as metadata.retailVp — never from gamification / leaderboard points,
 * and never auto-derived from 成交金額.
 */
export function resolveRetailVpFromTransaction(transaction: {
  transactionTypeKey: string;
  metadata?: Record<string, unknown> | null;
}): number | undefined {
  if (!isCustomerTransactionType(transaction.transactionTypeKey)) {
    return undefined;
  }
  const raw = transaction.metadata?.retailVp;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * Gamification points for a retail transaction type — from Business Rules only.
 * Used by gamification / leaderboard engines — NOT retail house VP display.
 */
export function resolveTransactionPoints(transactionTypeKey: string): number {
  const reward = DEFAULT_GAMIFICATION_RULES.points.eventRewards.find(
    (item) =>
      item.eventSource === GAMIFICATION_EVENT_SOURCES.TRANSACTION &&
      item.eventKey === transactionTypeKey,
  );
  return reward?.points ?? 0;
}

export function isCustomerTransactionType(transactionTypeKey: string): boolean {
  return transactionTypeKey.endsWith("_ntd");
}
