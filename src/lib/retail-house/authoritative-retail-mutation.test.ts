import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_IDS } from "@/lib/config/app-config";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  __resetRetailReconcileInflightForTests,
  ensureOwnRetailTransactionsReconciled,
  reconcileOwnRetailTransactions,
  type RetailTransactionsCloudPort,
} from "@/lib/cloud/reconcile-retail-transactions";
import { buildRetailHouseView } from "@/lib/retail-house/build-retail-house-view";
import { loadAuthoritativeRetailTransactions } from "@/lib/retail-house/authoritative-retail-transactions";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import { resolveRetailHouseDateRange } from "@/lib/retail-house/retail-house-date-range";
import {
  readRetailTransactionDeletionTombstoneIds,
} from "@/lib/retail-house/retail-transaction-deletion-tombstones";
import {
  deleteRetailTransactionForCurrentMember,
  updateRetailTransactionForCurrentMember,
} from "@/lib/retail-house/retail-transaction-service";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { RetailTransaction } from "@/types/retail-transaction";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TX_ID = "tx-authoritative-x";

function memoryStorage(seed: Record<string, string> = {}): StorageAdapter {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function authSeed(storage: StorageAdapter) {
  storage.setItem(
    STORAGE_KEYS.authSession,
    JSON.stringify({
      memberId: MEMBER_B,
      memberNumber: "B001",
      herbalifeMemberId: "B001",
      email: "b@example.com",
      signedInAt: "2026-08-01T00:00:00.000Z",
    }),
  );
  storage.setItem(
    STORAGE_KEYS.members,
    JSON.stringify([
      {
        id: MEMBER_B,
        organizationId: APP_IDS.organizationId,
        displayName: "Member B",
        herbalifeMemberId: "B001",
        email: "b@example.com",
        rankKey: "supervisor",
        roleKey: "member",
        status: "active",
        joinedAt: "2026-01-01",
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
  );
  storage.setItem(STORAGE_KEYS.eventsMigrated, "true");
}

function eventRow(id = TX_ID): BakiEvent {
  return {
    id,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    organizationId: APP_IDS.organizationId,
    memberId: MEMBER_B,
    eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    eventCategory: "transaction",
    eventDate: "2026-08-10",
    value: 5000,
    retailHouseKey: APP_IDS.defaultRetailHouseKey,
    metadata: { customerName: "小美", currencyCode: "TWD", retailVp: 150 },
  };
}

function legacyRow(id = TX_ID, memberId = MEMBER_B): RetailTransaction {
  return {
    id,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    organizationId: APP_IDS.organizationId,
    memberId,
    customerName: "小美",
    transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    transactionDate: "2026-08-10",
    amount: 5000,
    currencyCode: "TWD",
    retailHouseKey: APP_IDS.defaultRetailHouseKey,
    metadata: { customerName: "小美", currencyCode: "TWD", retailVp: 150 },
  };
}

describe("REQUIRED — authoritative Retail delete shapes", () => {
  beforeEach(() => {
    __resetRetailReconcileInflightForTests();
  });

  it("CASE 1: event only — delete removes row", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([eventRow()]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([]),
    });
    authSeed(storage);
    deleteRetailTransactionForCurrentMember(TX_ID, storage);
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(0);
    expect(readRetailTransactionDeletionTombstoneIds(storage).has(TX_ID)).toBe(true);
  });

  it("CASE 2: legacy only — delete succeeds (no 找不到)", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([legacyRow()]),
    });
    authSeed(storage);
    expect(() => deleteRetailTransactionForCurrentMember(TX_ID, storage)).not.toThrow();
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(0);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]")).toHaveLength(0);
  });

  it("CASE 3: event + legacy — both gone", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([eventRow()]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([legacyRow()]),
    });
    authSeed(storage);
    deleteRetailTransactionForCurrentMember(TX_ID, storage);
    expect(createEventRepository(storage).getById(TX_ID)).toBeNull();
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]")).toHaveLength(0);
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(0);
  });

  it("CASE 4: cloud still has X after local delete — reconcile must not resurrect", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([]),
    });
    authSeed(storage);
    // Simulate prior delete: tombstone present, local empty, cloud still has X
    storage.setItem(
      STORAGE_KEYS.retailTransactionDeletionTombstones,
      JSON.stringify([{ transactionId: TX_ID, memberId: MEMBER_B, deletedAt: "2026-08-31T00:00:00.000Z" }]),
    );

    const cloudTx = [legacyRow()];
    const port: RetailTransactionsCloudPort = {
      async fetchRetailPayload() {
        return cloudTx;
      },
      async fetchBakiEventsPayload() {
        return [eventRow()];
      },
      async upsertRetailPayload(_memberId, transactions) {
        cloudTx.splice(0, cloudTx.length, ...transactions);
      },
      async upsertBakiEventsPayload() {
        /* ok */
      },
    };

    const result = await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudRetailPayload: cloudTx,
      cloudBakiEventsPayload: [eventRow()],
      cloudPort: port,
    });
    expect(result.transactions.find((row) => row.id === TX_ID)).toBeUndefined();
    expect(cloudTx.find((row) => row.id === TX_ID)).toBeUndefined();
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(0);
  });

  it("CASE 5: bootstrap after delete — X remains deleted", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([eventRow()]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([legacyRow()]),
    });
    authSeed(storage);
    deleteRetailTransactionForCurrentMember(TX_ID, storage);

    const port: RetailTransactionsCloudPort = {
      async fetchRetailPayload() {
        return [legacyRow()];
      },
      async fetchBakiEventsPayload() {
        return [eventRow()];
      },
      async upsertRetailPayload() {},
      async upsertBakiEventsPayload() {},
    };
    await ensureOwnRetailTransactionsReconciled({
      storage,
      memberId: MEMBER_B,
      cloudPort: port,
    });
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(0);
  });

  it("CASE 6: legacy-only edit converges without duplicate + VP updates", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([legacyRow()]),
    });
    authSeed(storage);
    const metrics = updateRetailTransactionForCurrentMember(
      TX_ID,
      {
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        dateParts: { year: 2026, month: 8, day: 10 },
        customerName: "小美",
        value: 8000,
        retailVp: 220,
      },
      storage,
    );
    const events = JSON.parse(storage.getItem(STORAGE_KEYS.bakiEvents) ?? "[]") as BakiEvent[];
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(TX_ID);
    expect(events[0]?.value).toBe(8000);
    const range = resolveRetailHouseDateRange("month", "2026-08-31");
    const view = buildRetailHouseView(metrics, range, storage);
    const items = view.quadrants.flatMap((q) => q.weeklyItems);
    expect(items.filter((item) => item.transactionId === TX_ID)).toHaveLength(1);
    expect(items.find((item) => item.transactionId === TX_ID)?.points).toBe(220);
    expect(
      calculateMonthlyProductVp({
        memberId: MEMBER_B,
        yearMonth: "2026-08",
        transactions: loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions,
      }),
    ).toBe(220);
  });
});

describe("REQUIRED — startup retail reconcile orchestration", () => {
  it("ensureOwnRetailTransactionsReconciled dedupes in-flight calls to one cycle", async () => {
    __resetRetailReconcileInflightForTests();
    let fetchCount = 0;
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([legacyRow()]),
    });
    const port: RetailTransactionsCloudPort = {
      async fetchRetailPayload() {
        fetchCount += 1;
        await new Promise((r) => setTimeout(r, 20));
        return null;
      },
      async fetchBakiEventsPayload() {
        return null;
      },
      async upsertRetailPayload() {},
      async upsertBakiEventsPayload() {},
    };

    const [a, b] = await Promise.all([
      ensureOwnRetailTransactionsReconciled({ storage, memberId: MEMBER_B, cloudPort: port }),
      ensureOwnRetailTransactionsReconciled({ storage, memberId: MEMBER_B, cloudPort: port }),
    ]);
    expect(a.diagnostics.mergedCount).toBe(1);
    expect(b.diagnostics.mergedCount).toBe(1);
    expect(fetchCount).toBe(1);
  });

  it("AuthProvider no longer awaits retail reconcile; restoreCloudSession is non-blocking", () => {
    const authContext = readFileSync(
      resolve(process.cwd(), "src/lib/auth/auth-context.tsx"),
      "utf8",
    );
    expect(authContext).not.toContain("ensureOwnRetailTransactionsReconciled");
    const authService = readFileSync(
      resolve(process.cwd(), "src/lib/auth/auth-service.ts"),
      "utf8",
    );
    expect(authService).toMatch(/restoreCloudSession[\s\S]*awaitSync:\s*false/);
    const cloudSync = readFileSync(resolve(process.cwd(), "src/lib/auth/cloud-sync.ts"), "utf8");
    expect(cloudSync).not.toMatch(/await\s+ensureOwnRetailTransactionsReconciled/);
    expect(cloudSync).not.toMatch(/from\s+"@\/lib\/cloud\/reconcile-retail-transactions"/);
    expect(cloudSync).toContain("syncAppDataOnLogin");
  });
});
