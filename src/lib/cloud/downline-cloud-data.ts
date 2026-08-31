import { fetchCloudAppDataBatch } from "@/lib/cloud/cloud-app-data-service";
import { filterCloudDatabaseMemberIds } from "@/lib/cloud/cloud-member-ids";
import { toYearMonth } from "@/lib/business-engine/utils";
import {
  alignDownlineEventsToOwnerMemberId,
  mergeBakiEventsById,
  projectRetailTransactionsFromEvents,
  resolveMonthlyProductVpBatchFromEvents,
  resolveMonthlyProductVpFromEvents,
  sanitizeBakiEventsForProductVp,
} from "@/lib/retail-house/downline-product-vp";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { BakiEvent } from "@/types/baki-event";
import type { OrganizationTreeNode } from "@/types/organization-center";
import type { EntityId, ISODateString, YearMonth } from "@/types";
import type { RetailPipelineLead } from "@/types/retail-pipeline";
import type { RetailTransaction } from "@/types/retail-transaction";

/**
 * Cloud keys read for authorized downline Partner Detail / org metrics.
 * Retail House Product VP is event-sourced: transaction BakiEvents under bakiEvents
 * (same records the owner's Retail House projects).
 *
 * Authorization: Supabase RLS `member_app_data_select_downline` — only the member and
 * their sponsor hierarchy can SELECT. This client never exposes a generic
 * "get retail by arbitrary memberId" without that guard.
 */
const DOWNLINE_SYNC_KEYS = [
  STORAGE_KEYS.bakiEvents,
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
  // Some legacy rows wrapped the array — tolerate without throwing.
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.events)) {
      return record.events as T[];
    }
    if (Array.isArray(record.items)) {
      return record.items as T[];
    }
  }
  return [];
}

export interface DownlineMemberCloudData {
  /** Raw synced Baki events (includes Retail House transaction events), owner-aligned. */
  events: BakiEvent[];
  pipelineLeads: RetailPipelineLead[];
  /**
   * Authoritative Retail House transactions projected from `events`.
   * Same projection as the owner's Retail House (`projectEventsForEngines`).
   */
  retailTransactions: RetailTransaction[];
}

export type DownlineCloudDataCache = Map<EntityId, DownlineMemberCloudData>;

function emptyDownlineEntry(): DownlineMemberCloudData {
  return { events: [], pipelineLeads: [], retailTransactions: [] };
}

/**
 * Build a downline cache entry. Projection failures for one member return empty
 * Retail House data for that member — never throw.
 */
export function buildDownlineEntry(
  ownerMemberId: EntityId,
  events: unknown[],
  pipelineLeads: RetailPipelineLead[],
): DownlineMemberCloudData {
  try {
    const sanitized = sanitizeBakiEventsForProductVp(events);
    const aligned = alignDownlineEventsToOwnerMemberId(sanitized, ownerMemberId);
    return {
      events: aligned,
      pipelineLeads: Array.isArray(pipelineLeads) ? pipelineLeads : [],
      retailTransactions: projectRetailTransactionsFromEvents(aligned),
    };
  } catch (error) {
    console.error("[organization] downline_entry_build_failure", {
      memberId: ownerMemberId,
      error,
    });
    return {
      events: [],
      pipelineLeads: Array.isArray(pipelineLeads) ? pipelineLeads : [],
      retailTransactions: [],
    };
  }
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
    // Single bounded batch query (member_ids × sync keys) — not N Retail House history calls.
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
        const events = parseJsonArray<unknown>(row.payload);
        cache.set(row.memberId, buildDownlineEntry(row.memberId, events, entry.pipelineLeads));
      }
      if (row.dataKey === STORAGE_KEYS.retailPipelineLeads) {
        const pipelineLeads = parseJsonArray<RetailPipelineLead>(row.payload);
        cache.set(row.memberId, buildDownlineEntry(row.memberId, entry.events, pipelineLeads));
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

/**
 * Canonical monthly Product VP for a downline from cloud Retail House events.
 * Prefer this over qualification/engine `metrics.vp.totalVp` for Partner Detail.
 */
export function getDownlineMonthlyProductVp(
  memberId: EntityId,
  yearMonth: YearMonth,
  cache: DownlineCloudDataCache | undefined,
): number {
  try {
    const retailTransactions = getDownlineRetailTransactions(memberId, cache);
    if (cache?.has(memberId)) {
      return calculateMonthlyProductVp({
        memberId,
        yearMonth,
        transactions: retailTransactions,
      });
    }
    return resolveMonthlyProductVpFromEvents({
      memberId,
      yearMonth,
      events: getDownlineEvents(memberId, cache),
    });
  } catch (error) {
    console.error("[organization] product_vp_member_failure", { memberId, error });
    return 0;
  }
}

/** Batch Product VP for org tree — one projection pass per member, no N full metrics recalcs. */
export function getDownlineMonthlyProductVpBatch(
  memberIds: readonly EntityId[],
  yearMonth: YearMonth,
  cache: DownlineCloudDataCache | undefined,
): Map<EntityId, number> {
  try {
    const eventsByMemberId = new Map<EntityId, readonly BakiEvent[]>();
    for (const memberId of memberIds) {
      eventsByMemberId.set(memberId, getDownlineEvents(memberId, cache));
    }
    return resolveMonthlyProductVpBatchFromEvents({
      memberIds,
      yearMonth,
      eventsByMemberId,
    });
  } catch (error) {
    console.error("[organization] product_vp_batch_failure", error);
    const zeros = new Map<EntityId, number>();
    for (const memberId of memberIds) {
      zeros.set(memberId, 0);
    }
    return zeros;
  }
}

export function resolveYearMonthFromReferenceDate(referenceDate: string): YearMonth {
  return toYearMonth(referenceDate as ISODateString);
}

/** Merge cloud downline events with any local events already present for that member. */
export function mergeDownlineEventsWithLocal(
  memberId: EntityId,
  cache: DownlineCloudDataCache | undefined,
  localEvents: readonly BakiEvent[],
): BakiEvent[] {
  const cloudEvents = getDownlineEvents(memberId, cache);
  const memberLocal = localEvents.filter((event) => event.memberId === memberId);
  return mergeBakiEventsById(memberLocal, cloudEvents);
}
