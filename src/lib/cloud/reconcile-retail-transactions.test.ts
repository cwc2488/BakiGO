import { describe, expect, it, vi } from "vitest";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  buildDownlineEntry,
  getDownlineMonthlyProductVp,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import {
  ensureOwnRetailTransactionsReconciled,
  mergeRetailTransactionStores,
  reconcileOwnRetailTransactions,
  resolveLocalRowsForOwnReconciliation,
  RETAIL_TRANSACTIONS_STORAGE_KEY,
  type RetailTransactionsCloudPort,
} from "@/lib/cloud/reconcile-retail-transactions";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import { loadAuthoritativeRetailTransactions } from "@/lib/retail-house/authoritative-retail-transactions";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { RetailTransaction } from "@/types/retail-transaction";

const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEGACY_LOCAL_ID = "member-legacy-local";

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

function legacyTx(
  partial: Pick<
    RetailTransaction,
    "id" | "memberId" | "transactionTypeKey" | "transactionDate" | "amount"
  > & { retailVp?: number; updatedAt?: string },
): RetailTransaction {
  const isCustomer = partial.transactionTypeKey.endsWith("_ntd");
  return {
    id: partial.id,
    createdAt: partial.updatedAt ?? "2026-08-15T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-08-15T00:00:00.000Z",
    organizationId: "org-1",
    memberId: partial.memberId,
    customerName: "顧客",
    transactionTypeKey: partial.transactionTypeKey,
    transactionDate: partial.transactionDate,
    amount: partial.amount,
    currencyCode: "TWD",
    metadata: {
      customerName: "顧客",
      currencyCode: "TWD",
      ...(isCustomer && partial.retailVp != null ? { retailVp: partial.retailVp } : {}),
    },
  };
}

function fixture325(memberId: string): RetailTransaction[] {
  return [
    legacyTx({
      id: "c1",
      memberId,
      transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      transactionDate: "2026-08-05",
      amount: 3000,
      retailVp: 100,
    }),
    legacyTx({
      id: "c2",
      memberId,
      transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
      transactionDate: "2026-08-12",
      amount: 4000,
      retailVp: 125,
    }),
    legacyTx({
      id: "m1",
      memberId,
      transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
      transactionDate: "2026-08-20",
      amount: 100,
    }),
  ];
}

function memoryCloudPort(initial: Map<string, RetailTransaction[]> = new Map()) {
  const store = initial;
  const upsertCalls: Array<{ memberId: string; count: number }> = [];
  const port: RetailTransactionsCloudPort = {
    async fetchPayload(memberId) {
      if (!store.has(memberId)) {
        return null;
      }
      return store.get(memberId) ?? [];
    },
    async upsertPayload(memberId, transactions) {
      store.set(memberId, transactions);
      upsertCalls.push({ memberId, count: transactions.length });
    },
  };
  return { port, store, upsertCalls };
}

describe("storage key exactness", () => {
  it("RetailRepository key is exactly baki-go:retail-transactions", () => {
    expect(STORAGE_KEYS.retailTransactions).toBe("baki-go:retail-transactions");
    expect(RETAIL_TRANSACTIONS_STORAGE_KEY).toBe("baki-go:retail-transactions");
  });
});

describe("REQUIRED — restored session bootstrap without fresh login", () => {
  it("ensureOwnRetailTransactionsReconciled uploads 3 rows and Product VP = 325", async () => {
    // Stale local memberId (Production failure mode) — still must upload.
    const local = fixture325(LEGACY_LOCAL_ID);
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(local),
    });
    const { port, store, upsertCalls } = memoryCloudPort();

    const result = await ensureOwnRetailTransactionsReconciled({
      storage,
      memberId: MEMBER_B,
      cloudPort: port,
    });

    expect(result.diagnostics.status).toBe("success");
    expect(result.diagnostics.uploaded).toBe(true);
    expect(result.diagnostics.claimedLegacyMemberIds).toBe(true);
    expect(result.diagnostics.mergedCount).toBe(3);
    expect(upsertCalls).toHaveLength(1);
    expect(store.get(MEMBER_B)).toHaveLength(3);
    expect(store.get(MEMBER_B)?.every((row) => row.memberId === MEMBER_B)).toBe(true);

    const cache: DownlineCloudDataCache = new Map([
      [MEMBER_B, buildDownlineEntry(MEMBER_B, [], store.get(MEMBER_B) ?? [], [])],
    ]);
    expect(getDownlineMonthlyProductVp(MEMBER_B, "2026-08", cache)).toBe(325);
  });
});

describe("REQUIRED — fresh login path", () => {
  it("reconcileOwnRetailTransactions creates cloud row", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(fixture325(MEMBER_B)),
    });
    const { port, store } = memoryCloudPort();
    const result = await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPayload: null,
      cloudPort: port,
    });
    expect(result.diagnostics.uploaded).toBe(true);
    expect(store.get(MEMBER_B)).toHaveLength(3);
  });
});

describe("REQUIRED — empty local", () => {
  it("does not create fake history", async () => {
    const storage = memoryStorage();
    const { port, store, upsertCalls } = memoryCloudPort();
    const result = await ensureOwnRetailTransactionsReconciled({
      storage,
      memberId: MEMBER_B,
      cloudPort: port,
    });
    expect(result.diagnostics.status).toBe("no_local_data");
    expect(upsertCalls).toHaveLength(0);
    expect(store.has(MEMBER_B)).toBe(false);
  });
});

describe("REQUIRED — write failure preserves local + retryable", () => {
  it("keeps local and reports write_error", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(fixture325(MEMBER_B)),
    });
    const port: RetailTransactionsCloudPort = {
      async fetchPayload() {
        return null;
      },
      async upsertPayload() {
        throw new Error("rls denied");
      },
    };
    const result = await ensureOwnRetailTransactionsReconciled({
      storage,
      memberId: MEMBER_B,
      cloudPort: port,
    });
    expect(result.diagnostics.status).toBe("write_error");
    expect(result.diagnostics.uploaded).toBe(false);
    expect(
      JSON.parse(storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]"),
    ).toHaveLength(3);

    // Future bootstrap can retry with working port.
    const { port: okPort, store } = memoryCloudPort();
    const retry = await ensureOwnRetailTransactionsReconciled({
      storage,
      memberId: MEMBER_B,
      cloudPort: okPort,
    });
    expect(retry.diagnostics.status).toBe("success");
    expect(store.get(MEMBER_B)).toHaveLength(3);
  });
});

describe("REQUIRED — ownership", () => {
  it("writes only authenticated memberId cloud row", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(fixture325(MEMBER_A)),
    });
    const { port, store, upsertCalls } = memoryCloudPort();
    await ensureOwnRetailTransactionsReconciled({
      storage,
      memberId: MEMBER_A,
      cloudPort: port,
    });
    expect(upsertCalls.every((call) => call.memberId === MEMBER_A)).toBe(true);
    expect(store.has(MEMBER_B)).toBe(false);
  });

  it("API has no targetMemberId parameter", () => {
    const sample: Parameters<typeof ensureOwnRetailTransactionsReconciled>[0] = {
      storage: memoryStorage(),
      memberId: MEMBER_A,
    };
    expect("targetMemberId" in sample).toBe(false);
  });
});

describe("empty cloud must not erase local", () => {
  it("uses snapshot after catastrophic [] hydrate", async () => {
    const local = fixture325(MEMBER_B);
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(local),
    });
    const snapshot = storage.getItem(STORAGE_KEYS.retailTransactions);
    storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify([]));
    const { port, store } = memoryCloudPort();
    const result = await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPayload: [],
      localRawSnapshot: snapshot,
      cloudPort: port,
    });
    expect(result.diagnostics.mergedCount).toBe(3);
    expect(store.get(MEMBER_B)).toHaveLength(3);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]")).toHaveLength(3);
  });
});

describe("idempotency + two-sided merge", () => {
  it("second run does not duplicate", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(fixture325(MEMBER_B)),
    });
    const { port, store, upsertCalls } = memoryCloudPort();
    await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPayload: null,
      cloudPort: port,
    });
    const second = await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPayload: store.get(MEMBER_B),
      cloudPort: port,
    });
    expect(second.diagnostics.uploaded).toBe(false);
    expect(store.get(MEMBER_B)).toHaveLength(3);
    expect(upsertCalls).toHaveLength(1);
  });

  it("merges A B C ∪ A B D", () => {
    const local = [
      legacyTx({
        id: "A",
        memberId: MEMBER_B,
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-01",
        amount: 10,
        updatedAt: "2026-08-10T00:00:00.000Z",
      }),
      legacyTx({
        id: "B",
        memberId: MEMBER_B,
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-02",
        amount: 20,
        updatedAt: "2026-08-20T00:00:00.000Z",
      }),
      legacyTx({
        id: "C",
        memberId: MEMBER_B,
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-03",
        amount: 30,
      }),
    ];
    const cloud = [
      legacyTx({
        id: "A",
        memberId: MEMBER_B,
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-01",
        amount: 99,
        updatedAt: "2026-08-01T00:00:00.000Z",
      }),
      legacyTx({
        id: "B",
        memberId: MEMBER_B,
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-02",
        amount: 200,
        updatedAt: "2026-08-25T00:00:00.000Z",
      }),
      legacyTx({
        id: "D",
        memberId: MEMBER_B,
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-04",
        amount: 40,
      }),
    ];
    const merged = mergeRetailTransactionStores({
      ownerMemberId: MEMBER_B,
      local,
      cloud,
    });
    expect(merged.map((row) => row.id).sort()).toEqual(["A", "B", "C", "D"]);
    expect(merged.find((row) => row.id === "A")?.amount).toBe(10);
    expect(merged.find((row) => row.id === "B")?.amount).toBe(200);
  });
});

describe("legacy memberId claim", () => {
  it("claims stale local member ids to authenticated owner", () => {
    const resolved = resolveLocalRowsForOwnReconciliation({
      ownerMemberId: MEMBER_B,
      localAll: fixture325(LEGACY_LOCAL_ID),
    });
    expect(resolved.claimedLegacyMemberIds).toBe(true);
    expect(resolved.localOwned).toHaveLength(3);
    expect(resolved.localOwned.every((row) => row.memberId === MEMBER_B)).toBe(true);
  });
});

describe("own Product VP after claim+upload", () => {
  it("local authoritative VP matches cloud-derived VP", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(fixture325(LEGACY_LOCAL_ID)),
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
    });
    const { port, store } = memoryCloudPort();
    await ensureOwnRetailTransactionsReconciled({
      storage,
      memberId: MEMBER_B,
      cloudPort: port,
    });
    // After claim, local rows are remapped to MEMBER_B
    const ownVp = calculateMonthlyProductVp({
      memberId: MEMBER_B,
      yearMonth: "2026-08",
      transactions: loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions,
    });
    expect(ownVp).toBe(325);
    const cache: DownlineCloudDataCache = new Map([
      [MEMBER_B, buildDownlineEntry(MEMBER_B, [], store.get(MEMBER_B) ?? [], [])],
    ]);
    expect(getDownlineMonthlyProductVp(MEMBER_B, "2026-08", cache)).toBe(325);
  });
});
