import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";

export interface BodyRecordDeletionTombstone {
  recordId: EntityId;
  deletedAt: string;
}

function parseTombstones(raw: string | null): BodyRecordDeletionTombstone[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as BodyRecordDeletionTombstone[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readBodyRecordDeletionTombstones(
  storage: StorageAdapter,
): BodyRecordDeletionTombstone[] {
  return parseTombstones(storage.getItem(STORAGE_KEYS.bodyRecordDeletionTombstones));
}

export function readBodyRecordDeletionTombstoneIds(storage: StorageAdapter): Set<EntityId> {
  return new Set(readBodyRecordDeletionTombstones(storage).map((tombstone) => tombstone.recordId));
}

export function addBodyRecordDeletionTombstone(storage: StorageAdapter, recordId: EntityId): void {
  const current = readBodyRecordDeletionTombstones(storage);
  if (current.some((tombstone) => tombstone.recordId === recordId)) {
    return;
  }

  storage.setItem(
    STORAGE_KEYS.bodyRecordDeletionTombstones,
    JSON.stringify([...current, { recordId, deletedAt: new Date().toISOString() }]),
  );
}

export function clearBodyRecordDeletionTombstones(
  storage: StorageAdapter,
  recordIds: EntityId[],
): void {
  if (recordIds.length === 0) {
    return;
  }

  const removeIds = new Set(recordIds);
  const next = readBodyRecordDeletionTombstones(storage).filter(
    (tombstone) => !removeIds.has(tombstone.recordId),
  );
  storage.setItem(STORAGE_KEYS.bodyRecordDeletionTombstones, JSON.stringify(next));
}
