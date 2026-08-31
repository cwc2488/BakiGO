import { describe, expect, it } from "vitest";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  buildDownlineEntry,
  getDownlineMonthlyProductVp,
  getDownlineMonthlyProductVpBatch,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import {
  alignDownlineEventsToOwnerMemberId,
  mergeBakiEventsById,
  projectRetailTransactionsFromEvents,
  resolveMonthlyProductVpFromEvents,
} from "@/lib/retail-house/downline-product-vp";
import { migrateRetailTransactionToBakiEvent } from "@/lib/repositories/event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { BakiEvent } from "@/types/baki-event";
import type { RetailTransaction } from "@/types/retail-transaction";

const DOWNLINE_A = "11111111-1111-4111-8111-111111111111";
const DOWNLINE_B = "22222222-2222-4222-8222-222222222222";
const LEGACY_LOCAL_ID = "member-local-downline-a";

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

function cacheFromEvents(memberId: string, events: BakiEvent[]): DownlineCloudDataCache {
  return new Map([[memberId, buildDownlineEntry(memberId, events, [], [])]]);
}

function downlineAFixtureEvents(memberId = DOWNLINE_A): BakiEvent[] {
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

describe("downline Retail House Product VP pipeline", () => {
  it("preserves metadata.retailVp through event → transaction projection", () => {
    const events = [
      txEvent({
        id: "c1",
        memberId: DOWNLINE_A,
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
        eventDate: "2026-08-10",
        value: 5000,
        retailVp: 100,
      }),
    ];
    const txs = projectRetailTransactionsFromEvents(events);
    expect(txs).toHaveLength(1);
    expect(txs[0]?.metadata?.retailVp).toBe(100);
    expect(txs[0]?.memberId).toBe(DOWNLINE_A);
    expect(txs[0]?.transactionDate).toBe("2026-08-10");
  });

  it("own Retail House Product VP = authorized Partner Detail = 325", () => {
    const events = downlineAFixtureEvents();
    const cache = cacheFromEvents(DOWNLINE_A, events);
    const detailVp = getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cache);
    const ownHouseVp = calculateMonthlyProductVp({
      memberId: DOWNLINE_A,
      yearMonth: "2026-08",
      transactions: cache.get(DOWNLINE_A)!.retailTransactions,
    });

    expect(ownHouseVp).toBe(325);
    expect(detailVp).toBe(325);
    expect(detailVp).toBe(ownHouseVp);
  });

  it("edit 125→150 then void/delete customer 100 → 350 then 250", () => {
    let events = downlineAFixtureEvents();
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cacheFromEvents(DOWNLINE_A, events))).toBe(
      325,
    );

    events = events.map((event) =>
      event.id === "c2"
        ? { ...event, metadata: { ...event.metadata, retailVp: 150 } }
        : event,
    );
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cacheFromEvents(DOWNLINE_A, events))).toBe(
      350,
    );

    events = events.filter((event) => event.id !== "c1");
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cacheFromEvents(DOWNLINE_A, events))).toBe(
      250,
    );
  });

  it("excludes previous month and keeps current month", () => {
    const events = [
      ...downlineAFixtureEvents(),
      txEvent({
        id: "prev",
        memberId: DOWNLINE_A,
        eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
        eventDate: "2026-07-31",
        value: 999,
      }),
    ];
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cacheFromEvents(DOWNLINE_A, events))).toBe(
      325,
    );
  });

  it("aligns legacy local memberId in cloud blob to org cloud UUID (ID mapping)", () => {
    const events = downlineAFixtureEvents(LEGACY_LOCAL_ID);
    expect(
      resolveMonthlyProductVpFromEvents({
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
        events,
      }),
    ).toBe(325);

    const aligned = alignDownlineEventsToOwnerMemberId(events, DOWNLINE_A);
    expect(aligned.every((e) => e.memberId === DOWNLINE_A)).toBe(true);
    expect(
      getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cacheFromEvents(DOWNLINE_A, events)),
    ).toBe(325);
  });

  it("batches many downlines without N independent full-history paths", () => {
    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, downlineAFixtureEvents(), [], [])],
      [
        DOWNLINE_B,
        buildDownlineEntry(
          DOWNLINE_B,
          [
            txEvent({
              id: "b1",
              memberId: DOWNLINE_B,
              eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
              eventDate: "2026-08-01",
              value: 1000,
              retailVp: 20,
            }),
          ],
          [],
          [],
        ),
      ],
    ]);

    const batch = getDownlineMonthlyProductVpBatch([DOWNLINE_A, DOWNLINE_B], "2026-08", cache);
    expect(batch.get(DOWNLINE_A)).toBe(325);
    expect(batch.get(DOWNLINE_B)).toBe(20);
  });

  it("documents downline sync keys include Retail House event + legacy stores", () => {
    expect(STORAGE_KEYS.bakiEvents).toBe("baki-go:baki-events");
    expect(STORAGE_KEYS.retailTransactions).toBe("baki-go:retail-transactions");
  });
});

describe("legacy transaction → event migration preserves retailVp", () => {
  it("spreads transaction.metadata including retailVp into BakiEvent", () => {
    const legacyTx: RetailTransaction = {
      id: "tx1",
      createdAt: "2026-08-05T10:00:00.000Z",
      updatedAt: "2026-08-05T10:00:00.000Z",
      organizationId: "org-1",
      memberId: DOWNLINE_A,
      customerName: "A",
      transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      transactionDate: "2026-08-05",
      amount: 2000,
      currencyCode: "TWD",
      metadata: { retailVp: 100, customerName: "A" },
    };

    const event = migrateRetailTransactionToBakiEvent(legacyTx);
    expect(event.metadata?.retailVp).toBe(100);

    const txs = projectRetailTransactionsFromEvents([event]);
    expect(
      calculateMonthlyProductVp({
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
        transactions: txs,
      }),
    ).toBe(100);
  });
});
