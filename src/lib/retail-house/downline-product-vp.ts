/**
 * Downline Retail House → Product VP read model.
 *
 * Authoritative Retail House rows are BakiEvent transactions (synced in member_app_data
 * under STORAGE_KEYS.bakiEvents). This module projects those events to RetailTransaction
 * records and feeds the canonical Product VP calculator — same path the owner's Retail
 * House uses via projectEventsForEngines.
 */

import { projectEventsForEngines } from "@/lib/event-center/project-events";
import {
  calculateMonthlyProductVp,
  calculateMonthlyProductVpByMemberIds,
} from "@/lib/retail-house/canonical-product-vp";
import type { BakiEvent } from "@/types/baki-event";
import type { EntityId, YearMonth } from "@/types";
import type { RetailTransaction } from "@/types/retail-transaction";

/**
 * A member's `member_app_data` bakiEvents blob is that partner's Retail House.
 * Align event.memberId to the blob owner so org/Partner Detail Product VP does not
 * drop rows when a legacy local id differs from the cloud members.id UUID.
 */
export function alignDownlineEventsToOwnerMemberId(
  events: readonly BakiEvent[],
  ownerMemberId: EntityId,
): BakiEvent[] {
  return events.map((event) =>
    event.memberId === ownerMemberId ? event : { ...event, memberId: ownerMemberId },
  );
}

export function projectRetailTransactionsFromEvents(
  events: readonly BakiEvent[],
): RetailTransaction[] {
  return projectEventsForEngines([...events]).transactions;
}

export function resolveMonthlyProductVpFromEvents(input: {
  memberId: EntityId;
  yearMonth: YearMonth;
  events: readonly BakiEvent[];
}): number {
  const aligned = alignDownlineEventsToOwnerMemberId(input.events, input.memberId);
  const transactions = projectRetailTransactionsFromEvents(aligned);
  return calculateMonthlyProductVp({
    memberId: input.memberId,
    yearMonth: input.yearMonth,
    transactions,
  });
}

/**
 * Batch Product VP for many downlines from per-member event lists (one projection each).
 * Avoids N full Retail House / metrics recalculations on the org tree.
 */
export function resolveMonthlyProductVpBatchFromEvents(input: {
  memberIds: readonly EntityId[];
  yearMonth: YearMonth;
  eventsByMemberId: ReadonlyMap<EntityId, readonly BakiEvent[]>;
}): Map<EntityId, number> {
  const transactions: RetailTransaction[] = [];
  for (const memberId of input.memberIds) {
    const events = input.eventsByMemberId.get(memberId) ?? [];
    const aligned = alignDownlineEventsToOwnerMemberId(events, memberId);
    transactions.push(...projectRetailTransactionsFromEvents(aligned));
  }
  return calculateMonthlyProductVpByMemberIds({
    memberIds: input.memberIds,
    yearMonth: input.yearMonth,
    transactions,
  });
}

/** Merge event lists by id (later list wins) — used when combining local + cloud. */
export function mergeBakiEventsById(
  primary: readonly BakiEvent[],
  secondary: readonly BakiEvent[],
): BakiEvent[] {
  const byId = new Map<string, BakiEvent>();
  for (const event of primary) {
    byId.set(event.id, event);
  }
  for (const event of secondary) {
    byId.set(event.id, event);
  }
  return [...byId.values()];
}
