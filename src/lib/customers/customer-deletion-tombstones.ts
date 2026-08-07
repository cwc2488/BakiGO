import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";

export interface CustomerDeletionTombstone {
  customerId: EntityId;
  deletedAt: string;
}

function parseTombstones(raw: string | null): CustomerDeletionTombstone[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CustomerDeletionTombstone[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readCustomerDeletionTombstones(storage: StorageAdapter): CustomerDeletionTombstone[] {
  return parseTombstones(storage.getItem(STORAGE_KEYS.customerDeletionTombstones));
}

export function readCustomerDeletionTombstoneIds(storage: StorageAdapter): Set<EntityId> {
  return new Set(readCustomerDeletionTombstones(storage).map((tombstone) => tombstone.customerId));
}

export function addCustomerDeletionTombstone(storage: StorageAdapter, customerId: EntityId): void {
  const current = readCustomerDeletionTombstones(storage);
  if (current.some((tombstone) => tombstone.customerId === customerId)) {
    return;
  }

  storage.setItem(
    STORAGE_KEYS.customerDeletionTombstones,
    JSON.stringify([...current, { customerId, deletedAt: new Date().toISOString() }]),
  );
}

export function clearCustomerDeletionTombstones(storage: StorageAdapter, customerIds: EntityId[]): void {
  if (customerIds.length === 0) {
    return;
  }

  const removeIds = new Set(customerIds);
  const next = readCustomerDeletionTombstones(storage).filter(
    (tombstone) => !removeIds.has(tombstone.customerId),
  );
  storage.setItem(STORAGE_KEYS.customerDeletionTombstones, JSON.stringify(next));
}
