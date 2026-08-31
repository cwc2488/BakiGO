/**
 * Authoritative Retail House transaction read layer.
 *
 * OWN Retail House (RetailHousePage → buildRetailHouseView) historically read
 * EventRepository → STORAGE_KEYS.bakiEvents. Production also retains legacy
 * STORAGE_KEYS.retailTransactions that were never cloud-synced.
 *
 * This module is the single source-of-truth resolver for Product VP consumers:
 * Own Retail House, Partner Detail, Organization.
 *
 * Merge rule: legacy store ∪ event projection, dedupe by transaction id
 * (event-sourced row wins when both exist — current mutation path).
 */

import { projectEventsForEngines } from "@/lib/event-center/project-events";
import {
  calculateMonthlyProductVp,
  calculateMonthlyProductVpByMemberIds,
} from "@/lib/retail-house/canonical-product-vp";
import {
  alignDownlineEventsToOwnerMemberId,
  sanitizeBakiEventsForProductVp,
} from "@/lib/retail-house/downline-product-vp";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { createRetailRepository } from "@/lib/repositories/retail-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { EntityId, YearMonth } from "@/types";
import type { RetailTransaction } from "@/types/retail-transaction";

export type AuthoritativeRetailSource =
  | "events"
  | "legacy_retail_transactions"
  | "merged"
  | "empty";

export interface AuthoritativeRetailLoadDiagnostics {
  memberId: EntityId;
  yearMonth?: YearMonth;
  sourceSelected: AuthoritativeRetailSource;
  eventRowCount: number;
  legacyRowCount: number;
  projectedTransactionCount: number;
  deduplicatedCount: number;
  productVpTotal?: number;
  fallbackSourceUsed: boolean;
}

export interface AuthoritativeRetailTransactionsResult {
  transactions: RetailTransaction[];
  diagnostics: AuthoritativeRetailLoadDiagnostics;
}

export type ProductVpReadStatus = "ok" | "empty" | "error";

export interface ProductVpReadResult {
  status: ProductVpReadStatus;
  /** Set when status is ok or empty. Null only when status is error. */
  monthlyTotal: number | null;
  diagnostics: AuthoritativeRetailLoadDiagnostics;
}


function logProductVpRead(diagnostics: AuthoritativeRetailLoadDiagnostics): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  console.info("[retail_house] product_vp_read", {
    memberId: diagnostics.memberId,
    yearMonth: diagnostics.yearMonth,
    sourceSelected: diagnostics.sourceSelected,
    eventRowCount: diagnostics.eventRowCount,
    legacyRowCount: diagnostics.legacyRowCount,
    deduplicatedCount: diagnostics.deduplicatedCount,
    productVpTotal: diagnostics.productVpTotal,
    fallbackSourceUsed: diagnostics.fallbackSourceUsed,
  });
}

function isUsableRetailTransaction(value: unknown): value is RetailTransaction {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Partial<RetailTransaction>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.memberId === "string" &&
    row.memberId.length > 0 &&
    typeof row.transactionTypeKey === "string" &&
    typeof row.transactionDate === "string" &&
    row.transactionDate.length >= 7 &&
    typeof row.amount === "number"
  );
}

function sanitizeLegacyRetailTransactions(
  rows: readonly unknown[],
  ownerMemberId: EntityId,
): RetailTransaction[] {
  const cleaned: RetailTransaction[] = [];
  for (const raw of rows) {
    if (!isUsableRetailTransaction(raw)) {
      continue;
    }
    cleaned.push({
      ...raw,
      memberId: ownerMemberId,
      metadata: raw.metadata ? { ...raw.metadata } : raw.metadata,
    });
  }
  return cleaned;
}

function projectTransactionsFromEvents(
  events: readonly unknown[],
  ownerMemberId: EntityId,
): RetailTransaction[] {
  const sanitized = sanitizeBakiEventsForProductVp(events);
  const aligned = alignDownlineEventsToOwnerMemberId(sanitized, ownerMemberId);
  try {
    return projectEventsForEngines(aligned)
      .transactions.filter((tx) => isUsableRetailTransaction(tx))
      .map((tx) => ({
        ...tx,
        memberId: ownerMemberId,
        metadata: tx.metadata ? { ...tx.metadata } : tx.metadata,
      }));
  } catch (error) {
    console.error("[retail_house] project_events_failure", {
      memberId: ownerMemberId,
      error,
    });
    return [];
  }
}

/**
 * Deduplicate by stable id. Event-sourced rows overwrite legacy when both exist.
 */
export function mergeAuthoritativeRetailTransactions(input: {
  ownerMemberId: EntityId;
  eventProjected: readonly RetailTransaction[];
  legacy: readonly RetailTransaction[];
}): AuthoritativeRetailTransactionsResult {
  const byId = new Map<string, RetailTransaction>();

  for (const row of input.legacy) {
    byId.set(row.id, row);
  }
  for (const row of input.eventProjected) {
    byId.set(row.id, row);
  }

  const transactions = [...byId.values()];
  const eventCount = input.eventProjected.length;
  const legacyCount = input.legacy.length;
  let sourceSelected: AuthoritativeRetailSource = "empty";
  if (eventCount > 0 && legacyCount > 0) {
    sourceSelected = "merged";
  } else if (eventCount > 0) {
    sourceSelected = "events";
  } else if (legacyCount > 0) {
    sourceSelected = "legacy_retail_transactions";
  }

  return {
    transactions,
    diagnostics: {
      memberId: input.ownerMemberId,
      sourceSelected,
      eventRowCount: eventCount,
      legacyRowCount: legacyCount,
      projectedTransactionCount: eventCount,
      deduplicatedCount: transactions.length,
      fallbackSourceUsed: legacyCount > 0 && eventCount === 0,
    },
  };
}

/** Resolve authoritative RH rows from raw cloud/local payloads (no storage adapter). */
export function resolveAuthoritativeRetailTransactionsFromPayloads(input: {
  ownerMemberId: EntityId;
  events: readonly unknown[];
  legacyTransactions: readonly unknown[];
}): AuthoritativeRetailTransactionsResult {
  const eventProjected = projectTransactionsFromEvents(input.events, input.ownerMemberId);
  const legacy = sanitizeLegacyRetailTransactions(
    input.legacyTransactions,
    input.ownerMemberId,
  );
  return mergeAuthoritativeRetailTransactions({
    ownerMemberId: input.ownerMemberId,
    eventProjected,
    legacy,
  });
}

/**
 * Local authoritative read — same records Own Retail House must use.
 * Events (current) + legacy retailTransactions store.
 */
export function loadAuthoritativeRetailTransactions(
  storage: StorageAdapter,
  memberId: EntityId,
): AuthoritativeRetailTransactionsResult {
  try {
    const events = createEventRepository(storage).getByMemberId(memberId);
    const legacy = createRetailRepository(storage)
      .getAll()
      .filter((row) => row.memberId === memberId);
    return resolveAuthoritativeRetailTransactionsFromPayloads({
      ownerMemberId: memberId,
      events,
      legacyTransactions: legacy,
    });
  } catch (error) {
    console.error("[retail_house] authoritative_load_failure", { memberId, error });
    return {
      transactions: [],
      diagnostics: {
        memberId,
        sourceSelected: "empty",
        eventRowCount: 0,
        legacyRowCount: 0,
        projectedTransactionCount: 0,
        deduplicatedCount: 0,
        fallbackSourceUsed: false,
      },
    };
  }
}

export function calculateProductVpFromAuthoritativeTransactions(input: {
  memberId: EntityId;
  yearMonth: YearMonth;
  transactions: readonly RetailTransaction[];
  diagnostics?: AuthoritativeRetailLoadDiagnostics;
}): ProductVpReadResult {
  try {
    const monthlyTotal = calculateMonthlyProductVp({
      memberId: input.memberId,
      yearMonth: input.yearMonth,
      transactions: input.transactions,
    });
    const diagnostics: AuthoritativeRetailLoadDiagnostics = {
      ...(input.diagnostics ?? {
        memberId: input.memberId,
        sourceSelected: "empty" as const,
        eventRowCount: 0,
        legacyRowCount: 0,
        projectedTransactionCount: 0,
        deduplicatedCount: input.transactions.length,
        fallbackSourceUsed: false,
      }),
      yearMonth: input.yearMonth,
      productVpTotal: monthlyTotal,
    };
    logProductVpRead(diagnostics);
    return {
      status: monthlyTotal === 0 && input.transactions.length === 0 ? "empty" : "ok",
      monthlyTotal,
      diagnostics,
    };
  } catch (error) {
    console.error("[retail_house] product_vp_calc_failure", {
      memberId: input.memberId,
      yearMonth: input.yearMonth,
      error,
    });
    return {
      status: "error",
      monthlyTotal: null,
      diagnostics: {
        memberId: input.memberId,
        yearMonth: input.yearMonth,
        sourceSelected: input.diagnostics?.sourceSelected ?? "empty",
        eventRowCount: input.diagnostics?.eventRowCount ?? 0,
        legacyRowCount: input.diagnostics?.legacyRowCount ?? 0,
        projectedTransactionCount: input.diagnostics?.projectedTransactionCount ?? 0,
        deduplicatedCount: input.diagnostics?.deduplicatedCount ?? 0,
        fallbackSourceUsed: input.diagnostics?.fallbackSourceUsed ?? false,
      },
    };
  }
}

/** Own / single-member Product VP from authoritative local stores. */
export function getAuthoritativeMonthlyProductVp(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  yearMonth: YearMonth;
}): ProductVpReadResult {
  const loaded = loadAuthoritativeRetailTransactions(input.storage, input.memberId);
  return calculateProductVpFromAuthoritativeTransactions({
    memberId: input.memberId,
    yearMonth: input.yearMonth,
    transactions: loaded.transactions,
    diagnostics: loaded.diagnostics,
  });
}

/**
 * Batch Product VP for many members from per-member authoritative payloads.
 * Does not throw — per-member errors become status=error.
 */
export function getAuthorizedProductVpBatch(input: {
  memberIds: readonly EntityId[];
  yearMonth: YearMonth;
  payloadsByMemberId: ReadonlyMap<
    EntityId,
    { events: readonly unknown[]; legacyTransactions: readonly unknown[] }
  >;
}): Map<EntityId, ProductVpReadResult> {
  const results = new Map<EntityId, ProductVpReadResult>();
  const allTransactions: RetailTransaction[] = [];
  const diagnosticsByMember = new Map<EntityId, AuthoritativeRetailLoadDiagnostics>();

  for (const memberId of input.memberIds) {
    try {
      const payload = input.payloadsByMemberId.get(memberId) ?? {
        events: [],
        legacyTransactions: [],
      };
      const loaded = resolveAuthoritativeRetailTransactionsFromPayloads({
        ownerMemberId: memberId,
        events: payload.events,
        legacyTransactions: payload.legacyTransactions,
      });
      diagnosticsByMember.set(memberId, loaded.diagnostics);
      allTransactions.push(...loaded.transactions);
    } catch (error) {
      console.error("[retail_house] product_vp_batch_member_failure", { memberId, error });
      results.set(memberId, {
        status: "error",
        monthlyTotal: null,
        diagnostics: {
          memberId,
          yearMonth: input.yearMonth,
          sourceSelected: "empty",
          eventRowCount: 0,
          legacyRowCount: 0,
          projectedTransactionCount: 0,
          deduplicatedCount: 0,
          fallbackSourceUsed: false,
        },
      });
    }
  }

  let totals: Map<EntityId, number>;
  try {
    totals = calculateMonthlyProductVpByMemberIds({
      memberIds: input.memberIds.filter((id) => !results.has(id)),
      yearMonth: input.yearMonth,
      transactions: allTransactions,
    });
  } catch (error) {
    console.error("[retail_house] product_vp_batch_aggregate_failure", error);
    for (const memberId of input.memberIds) {
      if (!results.has(memberId)) {
        results.set(memberId, {
          status: "error",
          monthlyTotal: null,
          diagnostics: diagnosticsByMember.get(memberId) ?? {
            memberId,
            yearMonth: input.yearMonth,
            sourceSelected: "empty",
            eventRowCount: 0,
            legacyRowCount: 0,
            projectedTransactionCount: 0,
            deduplicatedCount: 0,
            fallbackSourceUsed: false,
          },
        });
      }
    }
    return results;
  }

  for (const memberId of input.memberIds) {
    if (results.has(memberId)) {
      continue;
    }
    const monthlyTotal = totals.get(memberId) ?? 0;
    const diagnostics = diagnosticsByMember.get(memberId)!;
    const withVp: AuthoritativeRetailLoadDiagnostics = {
      ...diagnostics,
      yearMonth: input.yearMonth,
      productVpTotal: monthlyTotal,
    };
    logProductVpRead(withVp);

    results.set(memberId, {
      status: monthlyTotal === 0 && diagnostics.deduplicatedCount === 0 ? "empty" : "ok",
      monthlyTotal,
      diagnostics: withVp,
    });
  }

  return results;
}

/** Expose event projection helper for tests that still pass BakiEvent lists. */
export function projectEventsToRetailTransactions(events: readonly BakiEvent[]): RetailTransaction[] {
  return projectEventsForEngines([...sanitizeBakiEventsForProductVp(events)]).transactions;
}
