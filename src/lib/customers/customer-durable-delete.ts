import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Customer } from "@/types/customer";
import type { EntityId } from "@/types";

/**
 * Server trigger semantics: once deleted_at is set, client updates cannot clear it.
 * Models public.customers_preserve_deleted_at().
 */
export function preserveServerDeletedAt(
  existingDeletedAt: string | null | undefined,
  incomingDeletedAt: string | null | undefined,
): string | null {
  if (existingDeletedAt) {
    return existingDeletedAt;
  }
  return incomingDeletedAt ?? null;
}

export function filterCustomersNotDeleted<T extends { id: EntityId }>(
  customers: T[],
  deletedIds: ReadonlySet<EntityId>,
): T[] {
  if (deletedIds.size === 0) {
    return customers;
  }
  return customers.filter((customer) => !deletedIds.has(customer.id));
}

export function mergeActiveCustomersById(
  localCustomers: Customer[],
  activeCloudCustomers: Customer[],
  tombstoneIds: ReadonlySet<EntityId>,
  serverDeletedIds: ReadonlySet<EntityId>,
): Customer[] {
  const blocked = new Set<EntityId>([...tombstoneIds, ...serverDeletedIds]);
  const localActive = filterCustomersNotDeleted(localCustomers, blocked);
  const cloudActive = filterCustomersNotDeleted(activeCloudCustomers, blocked);

  const merged = new Map<string, Customer>();
  for (const item of localActive) {
    merged.set(item.id, item);
  }
  for (const cloudItem of cloudActive) {
    const existing = merged.get(cloudItem.id);
    if (!existing) {
      merged.set(cloudItem.id, cloudItem);
      continue;
    }
    const localUpdated = new Date(existing.updatedAt).getTime();
    const cloudUpdated = new Date(cloudItem.updatedAt).getTime();
    if (cloudUpdated >= localUpdated) {
      merged.set(cloudItem.id, cloudItem);
    }
  }
  return [...merged.values()];
}

/** Remove soft-deleted customers and their local CRM satellites from storage. */
export function purgeLocalCustomersByIds(storage: StorageAdapter, customerIds: EntityId[]): void {
  if (customerIds.length === 0) {
    return;
  }

  const removeIds = new Set(customerIds);

  const customers = parseJsonArray<{ id: string }>(storage.getItem(STORAGE_KEYS.customers)).filter(
    (customer) => !removeIds.has(customer.id),
  );
  storage.setItem(STORAGE_KEYS.customers, JSON.stringify(customers));

  const records = parseJsonArray<{ customerId: string }>(
    storage.getItem(STORAGE_KEYS.customerBodyRecords),
  ).filter((record) => !removeIds.has(record.customerId));
  storage.setItem(STORAGE_KEYS.customerBodyRecords, JSON.stringify(records));

  const photos = parseJsonArray<{ customerId: string }>(
    storage.getItem(STORAGE_KEYS.customerProgressPhotos),
  ).filter((photo) => !removeIds.has(photo.customerId));
  storage.setItem(STORAGE_KEYS.customerProgressPhotos, JSON.stringify(photos));

  const receipts = parseJsonArray<{ customerId: string }>(
    storage.getItem(STORAGE_KEYS.customerReceiptPhotos),
  ).filter((receipt) => !removeIds.has(receipt.customerId));
  storage.setItem(STORAGE_KEYS.customerReceiptPhotos, JSON.stringify(receipts));
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
