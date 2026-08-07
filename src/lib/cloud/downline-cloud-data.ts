import { fetchCloudAppDataBatch } from "@/lib/cloud/cloud-app-data-service";
import { filterCloudDatabaseMemberIds } from "@/lib/cloud/cloud-member-ids";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { BakiEvent } from "@/types/baki-event";
import type { OrganizationTreeNode } from "@/types/organization-center";
import type { EntityId } from "@/types";
import type { RetailPipelineLead } from "@/types/retail-pipeline";

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
  events: BakiEvent[];
  pipelineLeads: RetailPipelineLead[];
}

export type DownlineCloudDataCache = Map<EntityId, DownlineMemberCloudData>;

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

  const rows = await fetchCloudAppDataBatch(targetIds, [...DOWNLINE_SYNC_KEYS]);
  const cache: DownlineCloudDataCache = new Map();

  for (const memberId of targetIds) {
    cache.set(memberId, { events: [], pipelineLeads: [] });
  }

  for (const row of rows) {
    const entry = cache.get(row.memberId);
    if (!entry) {
      continue;
    }

    if (row.dataKey === STORAGE_KEYS.bakiEvents) {
      entry.events = parseJsonArray<BakiEvent>(row.payload);
    }
    if (row.dataKey === STORAGE_KEYS.retailPipelineLeads) {
      entry.pipelineLeads = parseJsonArray<RetailPipelineLead>(row.payload);
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
