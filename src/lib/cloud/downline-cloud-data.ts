import { fetchCloudAppDataBatch } from "@/lib/cloud/cloud-app-data-service";
import { filterCloudDatabaseMemberIds } from "@/lib/cloud/cloud-member-ids";
import { toYearMonth } from "@/lib/business-engine/utils";
import {
  alignDownlineEventsToOwnerMemberId,
  mergeBakiEventsById,
  projectRetailTransactionsFromEvents,
  resolveMonthlyProductVpBatchFromEvents,
  resolveMonthlyProductVpFromEvents,
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

function buildDownlineEntry(
  ownerMemberId: EntityId,
  events: BakiEvent[],
  pipelineLeads: RetailPipelineLead[],
): DownlineMemberCloudData {
  const aligned = alignDownlineEventsToOwnerMemberId(events, ownerMemberId);
  return {
    events: aligned,
    pipelineLeads,
    retailTransactions: projectRetailTransactionsFromEvents(aligned),
  };
}

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

  // Single bounded batch query (member_ids × sync keys) — not N Retail House history calls.
  const rows = await fetchCloudAppDataBatch(targetIds, [...DOWNLINE_SYNC_KEYS]);
  const cache: DownlineCloudDataCache = new Map();

  for (const memberId of targetIds) {
    cache.set(memberId, buildDownlineEntry(memberId, [], []));
  }

  for (const row of rows) {
    const entry = cache.get(row.memberId);
    if (!entry) {
      continue;
    }

    if (row.dataKey === STORAGE_KEYS.bakiEvents) {
      const events = parseJsonArray<BakiEvent>(row.payload);
      cache.set(row.memberId, buildDownlineEntry(row.memberId, events, entry.pipelineLeads));
    }
    if (row.dataKey === STORAGE_KEYS.retailPipelineLeads) {
      const pipelineLeads = parseJsonArray<RetailPipelineLead>(row.payload);
      cache.set(row.memberId, buildDownlineEntry(row.memberId, entry.events, pipelineLeads));
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
}

/** Batch Product VP for org tree — one projection pass per member, no N full metrics recalcs. */
export function getDownlineMonthlyProductVpBatch(
  memberIds: readonly EntityId[],
  yearMonth: YearMonth,
  cache: DownlineCloudDataCache | undefined,
): Map<EntityId, number> {
  const eventsByMemberId = new Map<EntityId, readonly BakiEvent[]>();
  for (const memberId of memberIds) {
    eventsByMemberId.set(memberId, getDownlineEvents(memberId, cache));
  }
  return resolveMonthlyProductVpBatchFromEvents({
    memberIds,
    yearMonth,
    eventsByMemberId,
  });
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
