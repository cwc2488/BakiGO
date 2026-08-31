/**
 * Downline Retail House → Product VP read model.
 *
 * Authoritative Retail House rows are BakiEvent transactions (synced in member_app_data
 * under STORAGE_KEYS.bakiEvents). This module projects those events to RetailTransaction
 * records and feeds the canonical Product VP calculator — same path the owner's Retail
 * House uses via projectEventsForEngines.
 *
 * Production tolerance: sanitize at this boundary so one malformed legacy row cannot
 * crash Organization Center enrichment.
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
 * Drop non-objects / incomplete legacy rows before projection.
 * Does not mutate the caller's array or event objects.
 */
export function sanitizeBakiEventsForProductVp(events: readonly unknown[]): BakiEvent[] {
  const cleaned: BakiEvent[] = [];
  for (const raw of events) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const event = raw as Partial<BakiEvent>;
    if (typeof event.id !== "string" || event.id.length === 0) {
      continue;
    }
    if (typeof event.memberId !== "string" || event.memberId.length === 0) {
      continue;
    }
    if (typeof event.eventTypeKey !== "string" || event.eventTypeKey.length === 0) {
      continue;
    }
    if (event.eventCategory !== "transaction" && event.eventCategory !== "activity" && event.eventCategory !== "qualification") {
      // Legacy / unknown shapes — skip rather than throw.
      continue;
    }
    cleaned.push(event as BakiEvent);
  }
  return cleaned;
}

/**
 * A member's `member_app_data` bakiEvents blob is that partner's Retail House.
 * Align event.memberId to the blob owner so org/Partner Detail Product VP does not
 * drop rows when a legacy local id differs from the cloud members.id UUID.
 *
 * Always returns new event objects — never mutates shared/cloud cache inputs.
 */
export function alignDownlineEventsToOwnerMemberId(
  events: readonly BakiEvent[],
  ownerMemberId: EntityId,
): BakiEvent[] {
  return sanitizeBakiEventsForProductVp(events).map((event) => ({
    ...event,
    memberId: ownerMemberId,
    metadata: event.metadata ? { ...event.metadata } : event.metadata,
  }));
}

export function projectRetailTransactionsFromEvents(
  events: readonly BakiEvent[],
): RetailTransaction[] {
  const sanitized = sanitizeBakiEventsForProductVp(events);
  try {
    return projectEventsForEngines(sanitized).transactions;
  } catch (error) {
    console.error("[product_vp] project_events_failure", error);
    return [];
  }
}

export function resolveMonthlyProductVpFromEvents(input: {
  memberId: EntityId;
  yearMonth: YearMonth;
  events: readonly BakiEvent[];
}): number {
  try {
    const aligned = alignDownlineEventsToOwnerMemberId(input.events, input.memberId);
    const transactions = projectRetailTransactionsFromEvents(aligned);
    return calculateMonthlyProductVp({
      memberId: input.memberId,
      yearMonth: input.yearMonth,
      transactions,
    });
  } catch (error) {
    console.error("[product_vp] resolve_from_events_failure", {
      memberId: input.memberId,
      error,
    });
    return 0;
  }
}

/**
 * Batch Product VP for many downlines from per-member event lists (one projection each).
 * Avoids N full Retail House / metrics recalculations on the org tree.
 * Per-member failures are isolated — other members still resolve.
 */
export function resolveMonthlyProductVpBatchFromEvents(input: {
  memberIds: readonly EntityId[];
  yearMonth: YearMonth;
  eventsByMemberId: ReadonlyMap<EntityId, readonly BakiEvent[]>;
}): Map<EntityId, number> {
  const totals = new Map<EntityId, number>();
  for (const memberId of input.memberIds) {
    totals.set(memberId, 0);
  }

  const transactions: RetailTransaction[] = [];
  for (const memberId of input.memberIds) {
    try {
      const events = input.eventsByMemberId.get(memberId) ?? [];
      const aligned = alignDownlineEventsToOwnerMemberId(events, memberId);
      transactions.push(...projectRetailTransactionsFromEvents(aligned));
    } catch (error) {
      console.error("[product_vp] batch_member_projection_failure", { memberId, error });
    }
  }

  try {
    return calculateMonthlyProductVpByMemberIds({
      memberIds: input.memberIds,
      yearMonth: input.yearMonth,
      transactions,
    });
  } catch (error) {
    console.error("[product_vp] batch_aggregate_failure", error);
    return totals;
  }
}

/** Merge event lists by id (later list wins) — used when combining local + cloud. */
export function mergeBakiEventsById(
  primary: readonly BakiEvent[],
  secondary: readonly BakiEvent[],
): BakiEvent[] {
  const byId = new Map<string, BakiEvent>();
  for (const event of sanitizeBakiEventsForProductVp(primary)) {
    byId.set(event.id, event);
  }
  for (const event of sanitizeBakiEventsForProductVp(secondary)) {
    byId.set(event.id, event);
  }
  return [...byId.values()];
}
