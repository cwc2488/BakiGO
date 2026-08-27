import { describe, expect, it } from "vitest";
import {
  filterCustomersNotDeleted,
  mergeActiveCustomersById,
  preserveServerDeletedAt,
  purgeLocalCustomersByIds,
} from "@/lib/customers/customer-durable-delete";
import { addCustomerDeletionTombstone } from "@/lib/customers/customer-deletion-tombstones";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { Customer } from "@/types/customer";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

const OWNER = "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92";

function customer(partial: Partial<Customer> & Pick<Customer, "id" | "displayName">): Customer {
  const now = "2026-08-27T10:00:00.000Z";
  return {
    ownerMemberId: OWNER,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

class MemoryStorage implements StorageAdapter {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** In-memory stand-in for Supabase customers + preserve_deleted_at trigger. */
class FakeCustomerServer {
  private readonly rows = new Map<
    string,
    {
      id: string;
      owner_member_id: string;
      display_name: string;
      status: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }
  >();

  seed(row: Customer): void {
    this.rows.set(row.id, {
      id: row.id,
      owner_member_id: row.ownerMemberId,
      display_name: row.displayName,
      status: row.status,
      created_at: String(row.createdAt),
      updated_at: String(row.updatedAt),
      deleted_at: null,
    });
  }

  softDelete(ownerMemberId: string, customerId: string): void {
    const row = this.rows.get(customerId);
    if (!row || row.owner_member_id !== ownerMemberId || row.deleted_at) {
      return;
    }
    const now = new Date().toISOString();
    row.deleted_at = now;
    row.updated_at = now;
  }

  /** Models client upsert that omits deleted_at + DB trigger preservation. */
  upsertFromClient(payload: {
    id: string;
    owner_member_id: string;
    display_name: string;
    status: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string | null;
  }): void {
    const existing = this.rows.get(payload.id);
    if (!existing) {
      this.rows.set(payload.id, {
        id: payload.id,
        owner_member_id: payload.owner_member_id,
        display_name: payload.display_name,
        status: payload.status,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        deleted_at: payload.deleted_at ?? null,
      });
      return;
    }

    const nextDeletedAt = preserveServerDeletedAt(existing.deleted_at, payload.deleted_at);
    existing.display_name = payload.display_name;
    existing.status = payload.status;
    existing.updated_at = payload.updated_at;
    existing.deleted_at = nextDeletedAt;
  }

  fetchActive(ownerMemberId: string): Customer[] {
    return [...this.rows.values()]
      .filter((row) => row.owner_member_id === ownerMemberId && row.deleted_at === null)
      .map((row) =>
        customer({
          id: row.id,
          ownerMemberId: row.owner_member_id,
          displayName: row.display_name,
          status: row.status as Customer["status"],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }),
      );
  }

  fetchDeletedIds(ownerMemberId: string): string[] {
    return [...this.rows.values()]
      .filter((row) => row.owner_member_id === ownerMemberId && row.deleted_at !== null)
      .map((row) => row.id);
  }

  getDeletedAt(customerId: string): string | null {
    return this.rows.get(customerId)?.deleted_at ?? null;
  }
}

function syncDeviceFromServer(storage: StorageAdapter, server: FakeCustomerServer, ownerId: string): void {
  const deletedIds = server.fetchDeletedIds(ownerId);
  purgeLocalCustomersByIds(storage, deletedIds);
  const activeCloud = server.fetchActive(ownerId);
  const localRaw = storage.getItem(STORAGE_KEYS.customers);
  const localCustomers = localRaw ? (JSON.parse(localRaw) as Customer[]) : [];
  const tombRaw = storage.getItem(STORAGE_KEYS.customerDeletionTombstones);
  const tombstones = tombRaw
    ? (JSON.parse(tombRaw) as Array<{ customerId: string }>).map((item) => item.customerId)
    : [];
  const merged = mergeActiveCustomersById(
    localCustomers.filter((item) => item.ownerMemberId === ownerId),
    activeCloud,
    new Set(tombstones),
    new Set(deletedIds),
  );
  storage.setItem(STORAGE_KEYS.customers, JSON.stringify(merged));

  const pushable = filterCustomersNotDeleted(merged, new Set(deletedIds));
  for (const item of pushable) {
    server.upsertFromClient({
      id: item.id,
      owner_member_id: item.ownerMemberId,
      display_name: item.displayName,
      status: item.status,
      created_at: String(item.createdAt),
      updated_at: new Date().toISOString(),
      // intentional: stale clients may try to clear deletion
      deleted_at: null,
    });
  }
}

describe("CUSTOMER-DURABLE-DELETE-01", () => {
  it("preserveServerDeletedAt never clears an existing deleted_at", () => {
    expect(preserveServerDeletedAt("2026-08-27T12:00:00.000Z", null)).toBe(
      "2026-08-27T12:00:00.000Z",
    );
    expect(preserveServerDeletedAt("2026-08-27T12:00:00.000Z", undefined)).toBe(
      "2026-08-27T12:00:00.000Z",
    );
    expect(preserveServerDeletedAt(null, null)).toBeNull();
  });

  it("multi-device: Device B stale upsert cannot resurrect soft-deleted X", () => {
    const server = new FakeCustomerServer();
    const x = customer({ id: "cust-x", displayName: "X" });
    const z = customer({ id: "cust-z", displayName: "Z-unrelated" });
    server.seed(x);
    server.seed(z);

    const deviceA = new MemoryStorage();
    const deviceB = new MemoryStorage();
    deviceA.setItem(STORAGE_KEYS.customers, JSON.stringify([x, z]));
    deviceB.setItem(STORAGE_KEYS.customers, JSON.stringify([x, z]));

    // Device A deletes X
    addCustomerDeletionTombstone(deviceA, x.id);
    deviceA.setItem(STORAGE_KEYS.customers, JSON.stringify([z]));
    server.softDelete(OWNER, x.id);
    expect(server.getDeletedAt(x.id)).toBeTruthy();

    // Device B still has stale X and syncs (including hostile deleted_at: null upsert)
    syncDeviceFromServer(deviceB, server, OWNER);
    syncDeviceFromServer(deviceB, server, OWNER);
    syncDeviceFromServer(deviceA, server, OWNER);

    expect(server.getDeletedAt(x.id)).toBeTruthy();
    expect(server.fetchActive(OWNER).map((row) => row.id).sort()).toEqual(["cust-z"]);

    const aLocal = JSON.parse(deviceA.getItem(STORAGE_KEYS.customers)!) as Customer[];
    const bLocal = JSON.parse(deviceB.getItem(STORAGE_KEYS.customers)!) as Customer[];
    expect(aLocal.map((row) => row.id)).toEqual(["cust-z"]);
    expect(bLocal.map((row) => row.id)).toEqual(["cust-z"]);
  });

  it("new customer Y create/update/sync still works after durable delete of X", () => {
    const server = new FakeCustomerServer();
    const x = customer({ id: "cust-x2", displayName: "X2" });
    const z = customer({ id: "cust-z2", displayName: "Z2" });
    server.seed(x);
    server.seed(z);
    server.softDelete(OWNER, x.id);

    const device = new MemoryStorage();
    device.setItem(STORAGE_KEYS.customers, JSON.stringify([x, z]));
    syncDeviceFromServer(device, server, OWNER);

    const y = customer({
      id: "cust-y",
      displayName: "Y-new",
      updatedAt: "2026-08-27T13:00:00.000Z",
    });
    const local = JSON.parse(device.getItem(STORAGE_KEYS.customers)!) as Customer[];
    device.setItem(STORAGE_KEYS.customers, JSON.stringify([...local, y]));
    syncDeviceFromServer(device, server, OWNER);

    const yUpdated = {
      ...y,
      displayName: "Y-updated",
      updatedAt: "2026-08-27T14:00:00.000Z",
    };
    const afterCreate = JSON.parse(device.getItem(STORAGE_KEYS.customers)!) as Customer[];
    device.setItem(
      STORAGE_KEYS.customers,
      JSON.stringify(afterCreate.map((row) => (row.id === y.id ? yUpdated : row))),
    );
    syncDeviceFromServer(device, server, OWNER);

    const activeIds = server.fetchActive(OWNER).map((row) => row.id).sort();
    expect(activeIds).toEqual(["cust-y", "cust-z2"]);
    expect(server.fetchActive(OWNER).find((row) => row.id === "cust-y")?.displayName).toBe(
      "Y-updated",
    );
    expect(server.getDeletedAt(x.id)).toBeTruthy();
  });

  it("mergeActiveCustomersById drops server-deleted and tombstoned ids", () => {
    const local = [
      customer({ id: "a", displayName: "A" }),
      customer({ id: "b", displayName: "B" }),
      customer({ id: "c", displayName: "C" }),
    ];
    const cloud = [
      customer({ id: "a", displayName: "A-cloud", updatedAt: "2026-08-28T00:00:00.000Z" }),
      customer({ id: "c", displayName: "C" }),
    ];
    const merged = mergeActiveCustomersById(local, cloud, new Set(["b"]), new Set(["c"]));
    expect(merged.map((row) => row.id).sort()).toEqual(["a"]);
    expect(merged[0]?.displayName).toBe("A-cloud");
  });

  it("purgeLocalCustomersByIds removes satellites", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORAGE_KEYS.customers,
      JSON.stringify([customer({ id: "gone", displayName: "Gone" }), customer({ id: "keep", displayName: "Keep" })]),
    );
    storage.setItem(
      STORAGE_KEYS.customerBodyRecords,
      JSON.stringify([
        { id: "r1", customerId: "gone", updatedAt: "t" },
        { id: "r2", customerId: "keep", updatedAt: "t" },
      ]),
    );
    purgeLocalCustomersByIds(storage, ["gone"]);
    const customers = JSON.parse(storage.getItem(STORAGE_KEYS.customers)!) as Customer[];
    const records = JSON.parse(storage.getItem(STORAGE_KEYS.customerBodyRecords)!) as Array<{
      customerId: string;
    }>;
    expect(customers.map((row) => row.id)).toEqual(["keep"]);
    expect(records.map((row) => row.customerId)).toEqual(["keep"]);
  });
});
