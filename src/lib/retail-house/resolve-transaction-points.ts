import { DEFAULT_GAMIFICATION_RULES, GAMIFICATION_EVENT_SOURCES } from "@/lib/business-engine/rules/gamification";

/**
 * Gamification points for a retail transaction type — from Business Rules only.
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
