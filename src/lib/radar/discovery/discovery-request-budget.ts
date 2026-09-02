/**
 * Discovery request budget — counts actual Meta keyword_search HTTP calls.
 * Page 1 and every paging.next each cost 1. Phrase jobs do not.
 */

export type DiscoveryRequestBudget = {
  limit: number;
  consumed: number;
};

export function createDiscoveryRequestBudget(limit: number): DiscoveryRequestBudget {
  const safe = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  return { limit: safe, consumed: 0 };
}

export function remainingDiscoveryRequests(budget: DiscoveryRequestBudget): number {
  return Math.max(0, budget.limit - budget.consumed);
}

/** Returns false without incrementing when exhausted. Never goes negative. */
export function tryConsumeDiscoveryRequest(budget: DiscoveryRequestBudget): boolean {
  if (remainingDiscoveryRequests(budget) <= 0) return false;
  budget.consumed += 1;
  return true;
}
