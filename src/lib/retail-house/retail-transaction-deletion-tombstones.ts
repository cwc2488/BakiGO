import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";

export interface RetailTransactionDeletionTombstone {
  transactionId: EntityId;
  memberId: EntityId;
  deletedAt: string;
}

function parseTombstones(raw: string | null): RetailTransactionDeletionTombstone[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as RetailTransactionDeletionTombstone[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readRetailTransactionDeletionTombstones(
  storage: StorageAdapter,
): RetailTransactionDeletionTombstone[] {
  return parseTombstones(storage.getItem(STORAGE_KEYS.retailTransactionDeletionTombstones));
}

export function readRetailTransactionDeletionTombstoneIds(
  storage: StorageAdapter,
): Set<EntityId> {
  return new Set(
    readRetailTransactionDeletionTombstones(storage).map((tombstone) => tombstone.transactionId),
  );
}

export function addRetailTransactionDeletionTombstone(
  storage: StorageAdapter,
  input: { transactionId: EntityId; memberId: EntityId },
): void {
  const current = readRetailTransactionDeletionTombstones(storage);
  if (current.some((tombstone) => tombstone.transactionId === input.transactionId)) {
    return;
  }
  storage.setItem(
    STORAGE_KEYS.retailTransactionDeletionTombstones,
    JSON.stringify([
      ...current,
      {
        transactionId: input.transactionId,
        memberId: input.memberId,
        deletedAt: new Date().toISOString(),
      },
    ]),
  );
}

export function clearRetailTransactionDeletionTombstones(
  storage: StorageAdapter,
  transactionIds: readonly EntityId[],
): void {
  if (transactionIds.length === 0) {
    return;
  }
  const removeIds = new Set(transactionIds);
  const next = readRetailTransactionDeletionTombstones(storage).filter(
    (tombstone) => !removeIds.has(tombstone.transactionId),
  );
  storage.setItem(STORAGE_KEYS.retailTransactionDeletionTombstones, JSON.stringify(next));
}

export function filterOutRetailTombstonedIds<T extends { id: string }>(
  rows: readonly T[],
  tombstoneIds: ReadonlySet<EntityId>,
): T[] {
  if (tombstoneIds.size === 0) {
    return [...rows];
  }
  return rows.filter((row) => !tombstoneIds.has(row.id));
}
