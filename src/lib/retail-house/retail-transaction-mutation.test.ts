import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_IDS } from "@/lib/config/app-config";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { buildRetailHouseView } from "@/lib/retail-house/build-retail-house-view";
import {
  deleteRetailTransactionForCurrentMember,
  updateRetailTransactionForCurrentMember,
} from "@/lib/retail-house/retail-transaction-service";
import { loadAuthoritativeRetailTransactions } from "@/lib/retail-house/authoritative-retail-transactions";
import { resolveRetailHouseDateRange } from "@/lib/retail-house/retail-house-date-range";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { RetailTransaction } from "@/types/retail-transaction";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";

const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TX_ID = "tx-delete-me";

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

function dualStoreSeed(): { storage: StorageAdapter; event: BakiEvent; legacy: RetailTransaction } {
  const event: BakiEvent = {
    id: TX_ID,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    organizationId: APP_IDS.organizationId,
    memberId: MEMBER_B,
    eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    eventCategory: "transaction",
    eventDate: "2026-08-10",
    value: 5000,
    retailHouseKey: APP_IDS.defaultRetailHouseKey,
    metadata: {
      customerName: "小美",
      currencyCode: "TWD",
      retailVp: 150,
    },
  };
  const legacy: RetailTransaction = {
    id: TX_ID,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    organizationId: event.organizationId,
    memberId: MEMBER_B,
    customerName: "小美",
    transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    transactionDate: "2026-08-10",
    amount: 5000,
    currencyCode: "TWD",
    retailHouseKey: APP_IDS.defaultRetailHouseKey,
    metadata: {
      customerName: "小美",
      currencyCode: "TWD",
      retailVp: 150,
    },
  };
  const storage = memoryStorage({
    [STORAGE_KEYS.bakiEvents]: JSON.stringify([event]),
    [STORAGE_KEYS.retailTransactions]: JSON.stringify([legacy]),
    [STORAGE_KEYS.eventsMigrated]: "true",
    [STORAGE_KEYS.authSession]: JSON.stringify({
      memberId: MEMBER_B,
      memberNumber: "B001",
      herbalifeMemberId: "B001",
      email: "b@example.com",
      signedInAt: "2026-08-01T00:00:00.000Z",
    }),
    [STORAGE_KEYS.members]: JSON.stringify([
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
  });
  return { storage, event, legacy };
}

function listTransactionIds(
  storage: StorageAdapter,
  metrics: MemberComputedMetrics,
): string[] {
  const range = resolveRetailHouseDateRange("month", "2026-08-31");
  const view = buildRetailHouseView(metrics, range, storage);
  return view.quadrants.flatMap((q) => q.weeklyItems.map((item) => item.transactionId));
}

describe("REQUIRED — Retail House delete clears dual-store + list", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-4000-8000-000000000099",
    });
  });

  it("delete removes event AND legacy row — authoritative list has no X", () => {
    const { storage } = dualStoreSeed();
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(1);

    deleteRetailTransactionForCurrentMember(TX_ID, storage);

    const events = JSON.parse(storage.getItem(STORAGE_KEYS.bakiEvents) ?? "[]") as BakiEvent[];
    const legacy = JSON.parse(
      storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]",
    ) as RetailTransaction[];
    expect(events.find((row) => row.id === TX_ID)).toBeUndefined();
    expect(legacy.find((row) => row.id === TX_ID)).toBeUndefined();
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(0);
    expect(createEventRepository(storage).getById(TX_ID)).toBeNull();
  });

  it("regression: events-only delete used to resurrect card from legacy", () => {
    const { storage } = dualStoreSeed();
    // Simulate old bug: delete event only
    const events = JSON.parse(storage.getItem(STORAGE_KEYS.bakiEvents) ?? "[]") as BakiEvent[];
    storage.setItem(
      STORAGE_KEYS.bakiEvents,
      JSON.stringify(events.filter((row) => row.id !== TX_ID)),
    );
    // Legacy still present → authoritative still shows the card
    expect(loadAuthoritativeRetailTransactions(storage, MEMBER_B).transactions).toHaveLength(1);
  });

  it("buildRetailHouseView no longer lists deleted transaction", () => {
    const { storage } = dualStoreSeed();
    const seededMetrics = updateRetailTransactionForCurrentMember(
      TX_ID,
      {
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        dateParts: { year: 2026, month: 8, day: 10 },
        customerName: "小美",
        value: 5000,
        retailVp: 150,
      },
      storage,
    );
    expect(listTransactionIds(storage, seededMetrics)).toContain(TX_ID);

    const afterMetrics = deleteRetailTransactionForCurrentMember(TX_ID, storage);
    expect(listTransactionIds(storage, afterMetrics)).not.toContain(TX_ID);
  });

  it("second delete/edit attempt fails with 找不到 (no silent zombie edit)", () => {
    const { storage } = dualStoreSeed();
    deleteRetailTransactionForCurrentMember(TX_ID, storage);
    expect(() => deleteRetailTransactionForCurrentMember(TX_ID, storage)).toThrow(
      "找不到這筆成交紀錄。",
    );
  });
});

describe("REQUIRED — Retail House edit refreshes dual-store values", () => {
  it("update changes amount/VP in events and legacy mirror", () => {
    const { storage } = dualStoreSeed();
    const metrics = updateRetailTransactionForCurrentMember(
      TX_ID,
      {
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        dateParts: { year: 2026, month: 8, day: 10 },
        customerName: "小美",
        customerPhone: "",
        value: 8000,
        retailVp: 220,
        note: "",
      },
      storage,
    );

    const events = JSON.parse(storage.getItem(STORAGE_KEYS.bakiEvents) ?? "[]") as BakiEvent[];
    const legacy = JSON.parse(
      storage.getItem(STORAGE_KEYS.retailTransactions) ?? "[]",
    ) as RetailTransaction[];
    expect(events[0]?.value).toBe(8000);
    expect(events[0]?.metadata?.retailVp).toBe(220);
    expect(legacy[0]?.amount).toBe(8000);
    expect(legacy[0]?.metadata?.retailVp).toBe(220);

    const range = resolveRetailHouseDateRange("month", "2026-08-31");
    const view = buildRetailHouseView(metrics, range, storage);
    const item = view.quadrants
      .flatMap((q) => q.weeklyItems)
      .find((row) => row.transactionId === TX_ID);
    expect(item?.amount).toBe(8000);
    expect(item?.points).toBe(220);
  });
});
