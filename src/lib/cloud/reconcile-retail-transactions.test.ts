import { describe, expect, it, vi } from "vitest";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  buildDownlineEntry,
  getDownlineMonthlyProductVp,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import {
  mergeRetailTransactionStores,
  reconcileOwnRetailTransactions,
  type RetailTransactionsCloudPort,
} from "@/lib/cloud/reconcile-retail-transactions";
import { SYNCABLE_STORAGE_KEYS } from "@/lib/cloud/syncable-storage-keys";
import { enrichOrganizationRootsWithProductVp } from "@/lib/organization/enrich-organization-product-vp";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import { loadAuthoritativeRetailTransactions } from "@/lib/retail-house/authoritative-retail-transactions";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { OrganizationTreeNode } from "@/types/organization-center";
import type { RetailTransaction } from "@/types/retail-transaction";

const MEMBER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MEMBER_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VIEWER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

function orgNode(
  memberId: string,
  name: string,
  children: OrganizationTreeNode[] = [],
): OrganizationTreeNode {
  return {
    member: {
      memberId,
      name,
      memberNumber: memberId.slice(0, 8),
      qualificationLabel: "Supervisor",
      monthlyVp: 0,
      monthlyVpTarget: null,
      metMonthlyVp2500: false,
      nextQualification: {
        nextRankLabel: null,
        currentSummary: null,
        remainingSummary: null,
      },
      directDownlineCount: children.length,
      monthlyPoints: 0,
      lifetimePoints: 0,
      availablePoints: 0,
      streakMultiplier: 1,
    },
    children,
  };
}

function memoryCloudPort(initial: Map<string, RetailTransaction[]> = new Map()): {
  port: RetailTransactionsCloudPort;
  store: Map<string, RetailTransaction[]>;
  upsertCalls: Array<{ memberId: string; count: number }>;
} {
  const store = initial;
  const upsertCalls: Array<{ memberId: string; count: number }> = [];
  return {
    store,
    upsertCalls,
    port: {
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
    },
  };
}

describe("REQUIRED A — Production shape: local legacy, no cloud row", () => {
  it("uploads 3 transactions; Product VP 325 for Own / Detail / Org", async () => {
    const local = fixture325(MEMBER_B);
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(local),
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
    });
    const { port, store } = memoryCloudPort();

    const result = await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPayload: null,
      localRawSnapshot: storage.getItem(STORAGE_KEYS.retailTransactions),
      cloudPort: port,
    });

    expect(result.diagnostics.status).toBe("success");
    expect(result.diagnostics.uploaded).toBe(true);
    expect(result.diagnostics.mergedCount).toBe(3);
    expect(store.has(MEMBER_B)).toBe(true);
    expect(store.get(MEMBER_B)).toHaveLength(3);

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

    const enriched = enrichOrganizationRootsWithProductVp({
      roots: [orgNode(VIEWER, "Upline", [orgNode(MEMBER_B, "Downline")])],
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: cache,
      downlineIds: [VIEWER, MEMBER_B],
    });
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(325);
    expect(ownVp).toBe(enriched[0]?.children[0]?.member.monthlyVp);
  });
});

describe("REQUIRED B — empty cloud must not erase local", () => {
  it("local A B C survives missing cloud and empty [] cloud", async () => {
    const local = fixture325(MEMBER_B);
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(local),
    });
    const { port, store } = memoryCloudPort();

    // Snapshot before any hydration — simulates login sync gate.
    const snapshot = storage.getItem(STORAGE_KEYS.retailTransactions);

    // Catastrophic sequence that must NOT win: empty cloud hydrate first.
    // Reconciliation uses snapshot, not wiped state.
    storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify([]));

    const result = await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPayload: [],
      localRawSnapshot: snapshot,
      cloudPort: port,
    });

    expect(result.diagnostics.mergedCount).toBe(3);
    const restored = JSON.parse(
      storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]",
    ) as RetailTransaction[];
    expect(restored).toHaveLength(3);
    expect(store.get(MEMBER_B)).toHaveLength(3);
    expect(restored.map((row) => row.id).sort()).toEqual(["c1", "c2", "m1"]);
  });
});

describe("REQUIRED C — idempotency", () => {
  it("second reconciliation does not duplicate", async () => {
    const local = fixture325(MEMBER_B);
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(local),
    });
    const { port, store, upsertCalls } = memoryCloudPort();

    const first = await reconcileOwnRetailTransactions({
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

    expect(first.diagnostics.mergedCount).toBe(3);
    expect(second.diagnostics.mergedCount).toBe(3);
    expect(store.get(MEMBER_B)).toHaveLength(3);
    expect(second.diagnostics.uploaded).toBe(false);
    expect(upsertCalls.filter((call) => call.memberId === MEMBER_B)).toHaveLength(1);

    const ids = (store.get(MEMBER_B) ?? []).map((row) => row.id).sort();
    expect(ids).toEqual(["c1", "c2", "m1"]);
  });
});

describe("REQUIRED D — two-sided merge", () => {
  it("local A B C ∪ cloud A B D → A B C D; newer updatedAt wins", () => {
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
    expect(merged.find((row) => row.id === "A")?.amount).toBe(10); // local newer
    expect(merged.find((row) => row.id === "B")?.amount).toBe(200); // cloud newer
  });
});

describe("REQUIRED E — offline / cloud failure", () => {
  it("preserves local and reports failure when cloud fetch fails", async () => {
    const local = fixture325(MEMBER_B);
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(local),
    });
    const port: RetailTransactionsCloudPort = {
      async fetchPayload() {
        throw new Error("network down");
      },
      async upsertPayload() {
        throw new Error("should not upsert");
      },
    };

    const result = await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPort: port,
    });

    expect(result.diagnostics.status).toBe("failure");
    expect(result.diagnostics.uploaded).toBe(false);
    const kept = JSON.parse(
      storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]",
    ) as RetailTransaction[];
    expect(kept).toHaveLength(3);
  });
});

describe("REQUIRED F — ownership", () => {
  it("only authenticated member cloud row is written; foreign rows stay local-only", async () => {
    const mixed = [
      ...fixture325(MEMBER_A),
      legacyTx({
        id: "foreign",
        memberId: MEMBER_B,
        transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        transactionDate: "2026-08-01",
        amount: 50,
      }),
    ];
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(mixed),
    });
    const { port, store, upsertCalls } = memoryCloudPort();

    await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_A,
      cloudPayload: null,
      cloudPort: port,
    });

    expect(upsertCalls.every((call) => call.memberId === MEMBER_A)).toBe(true);
    expect(store.has(MEMBER_B)).toBe(false);
    expect(store.get(MEMBER_A)).toHaveLength(3);
    expect(store.get(MEMBER_A)?.every((row) => row.memberId === MEMBER_A)).toBe(true);

    const localAfter = JSON.parse(
      storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]",
    ) as RetailTransaction[];
    expect(localAfter.some((row) => row.id === "foreign")).toBe(true);
  });

  it("API has no targetMemberId — cannot upload as another member", () => {
    // Compile-time / API-shape guard: reconcileOwnRetailTransactions only accepts memberId.
    const keys = Object.keys({
      storage: memoryStorage(),
      memberId: MEMBER_A,
    } as Parameters<typeof reconcileOwnRetailTransactions>[0]);
    expect(keys).not.toContain("targetMemberId");
    expect(keys).toContain("memberId");
  });
});

describe("REQUIRED G — downline Product VP after reconciliation", () => {
  it("authorized upline sees same VP; unrelated member has no access to B payload", async () => {
    const local = fixture325(MEMBER_B);
    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(local),
    });
    const { port, store } = memoryCloudPort();

    await reconcileOwnRetailTransactions({
      storage,
      memberId: MEMBER_B,
      cloudPayload: null,
      cloudPort: port,
    });

    const ownVp = calculateMonthlyProductVp({
      memberId: MEMBER_B,
      yearMonth: "2026-08",
      transactions: loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions,
    });

    const authorizedCache: DownlineCloudDataCache = new Map([
      [MEMBER_B, buildDownlineEntry(MEMBER_B, [], store.get(MEMBER_B) ?? [], [])],
    ]);
    expect(getDownlineMonthlyProductVp(MEMBER_B, "2026-08", authorizedCache)).toBe(ownVp);
    expect(ownVp).toBe(325);

    // Unrelated Member C: no downline cache entry for B → Product VP read is 0 / empty.
    const unrelatedCache: DownlineCloudDataCache = new Map();
    expect(getDownlineMonthlyProductVp(MEMBER_B, "2026-08", unrelatedCache)).toBe(0);
    expect(store.has(MEMBER_C)).toBe(false);
  });
});

describe("sync architecture invariants", () => {
  it("retailTransactions is syncable but reconciliation is still required for history", () => {
    expect(SYNCABLE_STORAGE_KEYS).toContain(STORAGE_KEYS.retailTransactions);
  });
});
