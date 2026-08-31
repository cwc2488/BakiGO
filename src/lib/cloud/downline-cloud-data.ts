import { fetchCloudAppDataBatch } from "@/lib/cloud/cloud-app-data-service";
import { filterCloudDatabaseMemberIds } from "@/lib/cloud/cloud-member-ids";
import { toYearMonth } from "@/lib/business-engine/utils";
import {
  getAuthorizedProductVpBatch,
  resolveAuthoritativeRetailTransactionsFromPayloads,
  type ProductVpReadResult,
} from "@/lib/retail-house/authoritative-retail-transactions";
import { mergeBakiEventsById } from "@/lib/retail-house/downline-product-vp";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { BakiEvent } from "@/types/baki-event";
import type { OrganizationTreeNode } from "@/types/organization-center";
import type { EntityId, ISODateString, YearMonth } from "@/types";
import type { RetailPipelineLead } from "@/types/retail-pipeline";
import type { RetailTransaction } from "@/types/retail-transaction";

/**
 * Cloud keys for authorized downline Partner Detail / org metrics.
 * Product VP uses the SAME authoritative sources as Own Retail House:
 * - bakiEvents (current event-sourced path)
 * - retailTransactions (legacy RH store — Production may still hold truth here)
 */
const DOWNLINE_SYNC_KEYS = [
  STORAGE_KEYS.bakiEvents,
  STORAGE_KEYS.retailTransactions,
  STORAGE_KEYS.retailPipelineLeads,
] as const;

function parseJsonArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.events)) {
      return record.events as T[];
    }
    if (Array.isArray(record.items)) {
      return record.items as T[];
    }
    if (Array.isArray(record.transactions)) {
      return record.transactions as T[];
    }
  }
  return [];
}

export interface DownlineMemberCloudData {
  events: BakiEvent[];
  /** Legacy Retail House store (`baki-go:retail-transactions`). */
  legacyRetailTransactions: RetailTransaction[];
  pipelineLeads: RetailPipelineLead[];
  /**
   * Authoritative RH transactions = events ∪ legacy, deduped.
   * Same merge Own Retail House uses via loadAuthoritativeRetailTransactions.
   */
  retailTransactions: RetailTransaction[];
}

export type DownlineCloudDataCache = Map<EntityId, DownlineMemberCloudData>;

function emptyDownlineEntry(): DownlineMemberCloudData {
  return {
    events: [],
    legacyRetailTransactions: [],
    pipelineLeads: [],
    retailTransactions: [],
  };
}

export function buildDownlineEntry(
  ownerMemberId: EntityId,
  events: unknown[],
  legacyRetailTransactions: unknown[],
  pipelineLeads: RetailPipelineLead[],
): DownlineMemberCloudData {
  try {
    const eventRows = parseJsonArray<unknown>(events);
    const legacyRows = parseJsonArray<unknown>(legacyRetailTransactions);
    const resolved = resolveAuthoritativeRetailTransactionsFromPayloads({
      ownerMemberId,
      events: eventRows,
      legacyTransactions: legacyRows,
    });
    return {
      events: eventRows as BakiEvent[],
      legacyRetailTransactions: legacyRows as RetailTransaction[],
      pipelineLeads: Array.isArray(pipelineLeads) ? pipelineLeads : [],
      retailTransactions: resolved.transactions,
    };
  } catch (error) {
    console.error("[organization] downline_entry_build_failure", {
      memberId: ownerMemberId,
      error,
    });
    return emptyDownlineEntry();
  }
}

/**
 * Rebuild entry preserving sibling fields when one cloud key arrives.
 */
function rebuildDownlineEntry(
  ownerMemberId: EntityId,
  current: DownlineMemberCloudData,
  patch: {
    events?: unknown[];
    legacyRetailTransactions?: unknown[];
    pipelineLeads?: RetailPipelineLead[];
  },
): DownlineMemberCloudData {
  return buildDownlineEntry(
    ownerMemberId,
    patch.events ?? current.events,
    patch.legacyRetailTransactions ?? current.legacyRetailTransactions,
    patch.pipelineLeads ?? current.pipelineLeads,
  );
}

/**
 * Authorized batch read of downline app-data.
 * Network / RLS / parse failures return an empty cache — callers must still render org.
 */
export async function fetchDownlineCloudData(
  memberIds: EntityId[],
  viewerMemberId: EntityId,
): Promise<DownlineCloudDataCache> {
  const targetIds = filterCloudDatabaseMemberIds(
    memberIds.filter((id) => id !== viewerMemberId),
  );
  if (targetIds.length === 0) {
    return new Map();
  }

  const cache: DownlineCloudDataCache = new Map();
  for (const memberId of targetIds) {
    cache.set(memberId, emptyDownlineEntry());
  }

  let rows: Awaited<ReturnType<typeof fetchCloudAppDataBatch>> = [];
  try {
    rows = await fetchCloudAppDataBatch(targetIds, [...DOWNLINE_SYNC_KEYS]);
  } catch (error) {
    console.error("[organization] downline_cloud_failure", error);
    return cache;
  }

  for (const row of rows) {
    const entry = cache.get(row.memberId);
    if (!entry) {
      continue;
    }

    try {
      if (row.dataKey === STORAGE_KEYS.bakiEvents) {
        cache.set(
          row.memberId,
          rebuildDownlineEntry(row.memberId, entry, {
            events: parseJsonArray<unknown>(row.payload),
          }),
        );
      }
      if (row.dataKey === STORAGE_KEYS.retailTransactions) {
        cache.set(
          row.memberId,
          rebuildDownlineEntry(row.memberId, entry, {
            legacyRetailTransactions: parseJsonArray<unknown>(row.payload),
          }),
        );
      }
      if (row.dataKey === STORAGE_KEYS.retailPipelineLeads) {
        cache.set(
          row.memberId,
          rebuildDownlineEntry(row.memberId, entry, {
            pipelineLeads: parseJsonArray<RetailPipelineLead>(row.payload),
          }),
        );
      }
    } catch (error) {
      console.error("[organization] downline_row_parse_failure", {
        memberId: row.memberId,
        dataKey: row.dataKey,
        error,
      });
      cache.set(row.memberId, emptyDownlineEntry());
    }
  }

  return cache;
}

export function collectMemberIdsFromTree(node: OrganizationTreeNode): EntityId[] {
  const ids: EntityId[] = [node.member.memberId];
  for (const child of node.children) {
    ids.push(...collectMemberIdsFromTree(child));
  }
  return ids;
}

export function getDownlineEvents(
  memberId: EntityId,
  cache: DownlineCloudDataCache | undefined,
): BakiEvent[] {
  return cache?.get(memberId)?.events ?? [];
}

export function getDownlinePipelineLeads(
  memberId: EntityId,
  cache: DownlineCloudDataCache | undefined,
): RetailPipelineLead[] {
  return cache?.get(memberId)?.pipelineLeads ?? [];
}

export function getDownlineRetailTransactions(
  memberId: EntityId,
  cache: DownlineCloudDataCache | undefined,
): RetailTransaction[] {
  return cache?.get(memberId)?.retailTransactions ?? [];
}

export function getDownlineLegacyRetailTransactions(
  memberId: EntityId,
  cache: DownlineCloudDataCache | undefined,
): RetailTransaction[] {
  return cache?.get(memberId)?.legacyRetailTransactions ?? [];
}

/**
 * Canonical monthly Product VP for a downline from authoritative RH sources
 * (events ∪ legacy retailTransactions) — NOT qualification metrics.vp.
 */
export function getDownlineMonthlyProductVp(
  memberId: EntityId,
  yearMonth: YearMonth,
  cache: DownlineCloudDataCache | undefined,
): number {
  const result = getDownlineMonthlyProductVpResult(memberId, yearMonth, cache);
  return result.monthlyTotal ?? 0;
}

export function getDownlineMonthlyProductVpResult(
  memberId: EntityId,
  yearMonth: YearMonth,
  cache: DownlineCloudDataCache | undefined,
): ProductVpReadResult {
  const entry = cache?.get(memberId);
  const batch = getAuthorizedProductVpBatch({
    memberIds: [memberId],
    yearMonth,
    payloadsByMemberId: new Map([
      [
        memberId,
        {
          events: entry?.events ?? [],
          legacyTransactions: entry?.legacyRetailTransactions ?? [],
        },
      ],
    ]),
  });
  return (
    batch.get(memberId) ?? {
      status: "empty",
      monthlyTotal: 0,
      diagnostics: {
        memberId,
        yearMonth,
        sourceSelected: "empty",
        eventRowCount: 0,
        legacyRowCount: 0,
        projectedTransactionCount: 0,
        deduplicatedCount: 0,
        fallbackSourceUsed: false,
      },
    }
  );
}

/** Batch Product VP for org tree via authoritative RH read layer. */
export function getDownlineMonthlyProductVpBatch(
  memberIds: readonly EntityId[],
  yearMonth: YearMonth,
  cache: DownlineCloudDataCache | undefined,
): Map<EntityId, number> {
  const results = getDownlineMonthlyProductVpBatchResults(memberIds, yearMonth, cache);
  const totals = new Map<EntityId, number>();
  for (const memberId of memberIds) {
    const result = results.get(memberId);
    totals.set(memberId, result?.monthlyTotal ?? 0);
  }
  return totals;
}

export function getDownlineMonthlyProductVpBatchResults(
  memberIds: readonly EntityId[],
  yearMonth: YearMonth,
  cache: DownlineCloudDataCache | undefined,
): Map<EntityId, ProductVpReadResult> {
  const payloadsByMemberId = new Map<
    EntityId,
    { events: readonly unknown[]; legacyTransactions: readonly unknown[] }
  >();
  for (const memberId of memberIds) {
    const entry = cache?.get(memberId);
    payloadsByMemberId.set(memberId, {
      events: entry?.events ?? [],
      legacyTransactions: entry?.legacyRetailTransactions ?? [],
    });
  }
  return getAuthorizedProductVpBatch({
    memberIds,
    yearMonth,
    payloadsByMemberId,
  });
}

export function resolveYearMonthFromReferenceDate(referenceDate: string): YearMonth {
  return toYearMonth(referenceDate as ISODateString);
}

export function mergeDownlineEventsWithLocal(
  memberId: EntityId,
  cache: DownlineCloudDataCache | undefined,
  localEvents: readonly BakiEvent[],
): BakiEvent[] {
  const cloudEvents = getDownlineEvents(memberId, cache);
  const memberLocal = localEvents.filter((event) => event.memberId === memberId);
  return mergeBakiEventsById(memberLocal, cloudEvents);
}
