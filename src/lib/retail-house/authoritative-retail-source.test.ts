import { describe, expect, it, vi } from "vitest";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  buildDownlineEntry,
  getDownlineMonthlyProductVp,
  getDownlineMonthlyProductVpBatch,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { SYNCABLE_STORAGE_KEYS } from "@/lib/cloud/syncable-storage-keys";
import { enrichOrganizationRootsWithProductVp } from "@/lib/organization/enrich-organization-product-vp";
import {
  getAuthoritativeMonthlyProductVp,
  loadAuthoritativeRetailTransactions,
  mergeAuthoritativeRetailTransactions,
  resolveAuthoritativeRetailTransactionsFromPayloads,
} from "@/lib/retail-house/authoritative-retail-transactions";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { OrganizationTreeNode } from "@/types/organization-center";
import type { RetailTransaction } from "@/types/retail-transaction";

const DOWNLINE_A = "11111111-1111-4111-8111-111111111111";
const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
  > & { retailVp?: number },
): RetailTransaction {
  const isCustomer = partial.transactionTypeKey.endsWith("_ntd");
  return {
    id: partial.id,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
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

function fixture325Legacy(memberId = DOWNLINE_A): RetailTransaction[] {
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

function txEvent(
  partial: Pick<BakiEvent, "id" | "memberId" | "eventTypeKey" | "eventDate" | "value"> & {
    retailVp?: number;
  },
): BakiEvent {
  const isCustomer = partial.eventTypeKey.endsWith("_ntd");
  return {
    id: partial.id,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    organizationId: "org-1",
    memberId: partial.memberId,
    eventTypeKey: partial.eventTypeKey,
    eventCategory: "transaction",
    eventDate: partial.eventDate,
    value: partial.value,
    retailHouseKey: "house-default",
    metadata: {
      customerName: "顧客",
      currencyCode: "TWD",
      ...(isCustomer && partial.retailVp != null ? { retailVp: partial.retailVp } : {}),
    },
  };
}

function fixture325Events(memberId = DOWNLINE_A): BakiEvent[] {
  return [
    txEvent({
      id: "c1",
      memberId,
      eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      eventDate: "2026-08-05",
      value: 3000,
      retailVp: 100,
    }),
    txEvent({
      id: "c2",
      memberId,
      eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
      eventDate: "2026-08-12",
      value: 4000,
      retailVp: 125,
    }),
    txEvent({
      id: "m1",
      memberId,
      eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
      eventDate: "2026-08-20",
      value: 100,
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

describe("REQUIRED: legacy Retail House store has VP while bakiEvents empty", () => {
  it("Own RH = Partner Detail = Organization = 325 when only legacy retailTransactions exist", () => {
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const legacy = fixture325Legacy();

    // Prove events-alone would be 0
    const eventsOnly = resolveAuthoritativeRetailTransactionsFromPayloads({
      ownerMemberId: DOWNLINE_A,
      events: [],
      legacyTransactions: [],
    });
    expect(
      getAuthoritativeMonthlyProductVp({
        storage: memoryStorage(),
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
      }).monthlyTotal,
    ).toBe(0);
    expect(eventsOnly.diagnostics.sourceSelected).toBe("empty");

    // Legacy-only authoritative read
    const resolved = resolveAuthoritativeRetailTransactionsFromPayloads({
      ownerMemberId: DOWNLINE_A,
      events: [],
      legacyTransactions: legacy,
    });
    expect(resolved.diagnostics.sourceSelected).toBe("legacy_retail_transactions");
    expect(resolved.diagnostics.fallbackSourceUsed).toBe(true);

    const storage = memoryStorage({
      [STORAGE_KEYS.retailTransactions]: JSON.stringify(legacy),
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
      [STORAGE_KEYS.eventsMigrated]: "true",
    });

    // Own Retail House uses loadAuthoritativeRetailTransactions (same as buildRetailHouseView).
    const ownLoaded = loadAuthoritativeRetailTransactions(storage, DOWNLINE_A);
    expect(ownLoaded.diagnostics.sourceSelected).toBe("legacy_retail_transactions");
    const ownProductVp = calculateMonthlyProductVp({
      memberId: DOWNLINE_A,
      yearMonth: "2026-08",
      transactions: ownLoaded.transactions,
    });
    expect(ownProductVp).toBe(325);

    expect(
      getAuthoritativeMonthlyProductVp({
        storage,
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
      }).monthlyTotal,
    ).toBe(325);

    // Downline cloud cache shaped like Production: empty bakiEvents + legacy store
    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, [], legacy, [])],
    ]);
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cache)).toBe(325);

    const enriched = enrichOrganizationRootsWithProductVp({
      roots: [orgNode(VIEWER, "Upline", [orgNode(DOWNLINE_A, "陳佳昱")])],
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: cache,
      downlineIds: [VIEWER, DOWNLINE_A],
    });
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(325);
    expect(enriched[0]?.children[0]?.member.productVpStatus).toBe("ready");
    expect(ownProductVp).toBe(enriched[0]?.children[0]?.member.monthlyVp);

    consoleSpy.mockRestore();
  });
});

describe("event-sourced shape still works", () => {
  it("Own / Partner Detail / Organization = 325 from bakiEvents", () => {
    const events = fixture325Events();
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify(events),
    });
    expect(
      getAuthoritativeMonthlyProductVp({
        storage,
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
      }).monthlyTotal,
    ).toBe(325);

    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, events, [], [])],
    ]);
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cache)).toBe(325);
  });
});

describe("mixed legacy + events — no double count", () => {
  it("dedupes by id; event row wins; edit/void reflected", () => {
    const legacy = fixture325Legacy();
    // Same ids in events with edited customer VP 150
    const events = fixture325Events().map((event) =>
      event.id === "c2"
        ? { ...event, metadata: { ...event.metadata, retailVp: 150 } }
        : event,
    );

    const merged = mergeAuthoritativeRetailTransactions({
      ownerMemberId: DOWNLINE_A,
      eventProjected: resolveAuthoritativeRetailTransactionsFromPayloads({
        ownerMemberId: DOWNLINE_A,
        events,
        legacyTransactions: [],
      }).transactions,
      legacy,
    });
    expect(merged.diagnostics.deduplicatedCount).toBe(3);
    expect(merged.diagnostics.sourceSelected).toBe("merged");

    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, events, legacy, [])],
    ]);
    // 100 + 150 + 100 = 350 (event edit wins over legacy 125)
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cache)).toBe(350);

    // void/delete c1 from both
    const eventsAfterDelete = events.filter((e) => e.id !== "c1");
    const legacyAfterDelete = legacy.filter((t) => t.id !== "c1");
    const cacheAfter = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, eventsAfterDelete, legacyAfterDelete, [])],
    ]) as DownlineCloudDataCache;
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cacheAfter)).toBe(250);
  });
});

describe("realtime sync contract", () => {
  it("retailTransactions is a syncable cloud key (no cron required)", () => {
    expect(SYNCABLE_STORAGE_KEYS).toContain(STORAGE_KEYS.retailTransactions);
    expect(SYNCABLE_STORAGE_KEYS).toContain(STORAGE_KEYS.bakiEvents);
  });

  it("new legacy-shaped row appears in next authoritative read without migration", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
      [STORAGE_KEYS.eventsMigrated]: "true",
    });
    expect(
      getAuthoritativeMonthlyProductVp({
        storage,
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
      }).monthlyTotal,
    ).toBe(0);

    storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify(fixture325Legacy()));
    expect(
      loadAuthoritativeRetailTransactions(storage, DOWNLINE_A).diagnostics.sourceSelected,
    ).toBe("legacy_retail_transactions");
    expect(
      getAuthoritativeMonthlyProductVp({
        storage,
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
      }).monthlyTotal,
    ).toBe(325);
  });
});

describe("batch + org load still resilient", () => {
  it("batch returns legacy 325 beside empty sibling", () => {
    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, [], fixture325Legacy(), [])],
      [
        "22222222-2222-4222-8222-222222222222",
        buildDownlineEntry("22222222-2222-4222-8222-222222222222", [], [], []),
      ],
    ]);
    const batch = getDownlineMonthlyProductVpBatch(
      [DOWNLINE_A, "22222222-2222-4222-8222-222222222222"],
      "2026-08",
      cache,
    );
    expect(batch.get(DOWNLINE_A)).toBe(325);
    expect(batch.get("22222222-2222-4222-8222-222222222222")).toBe(0);
  });
});
