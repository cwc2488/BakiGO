import { describe, expect, it, vi } from "vitest";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import {
  buildDownlineEntry,
  getDownlineMonthlyProductVp,
  getDownlineMonthlyProductVpBatch,
  type DownlineCloudDataCache,
} from "@/lib/cloud/downline-cloud-data";
import { enrichOrganizationRootsWithProductVp } from "@/lib/organization/enrich-organization-product-vp";
import {
  alignDownlineEventsToOwnerMemberId,
  projectRetailTransactionsFromEvents,
  resolveMonthlyProductVpFromEvents,
  sanitizeBakiEventsForProductVp,
} from "@/lib/retail-house/downline-product-vp";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { OrganizationTreeNode } from "@/types/organization-center";

const DOWNLINE_A = "11111111-1111-4111-8111-111111111111";
const DOWNLINE_B = "22222222-2222-4222-8222-222222222222";
const VIEWER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEGACY_LOCAL_ID = "member-local-downline-a";

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

function fixture325(memberId = DOWNLINE_A): BakiEvent[] {
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

/**
 * Production-like malformed blob discovered as org-crash shape:
 * null holes, missing eventDate, wrapped payload leftovers, legacy local memberId,
 * non-object entries, and customer rows without retailVp.
 */
function productionLegacyCrashBlob(ownerId: string): unknown[] {
  return [
    null,
    "not-an-event",
    42,
    {
      id: "hole",
      // missing memberId / eventTypeKey / eventCategory
    },
    {
      id: "no-date",
      memberId: LEGACY_LOCAL_ID,
      eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
      eventCategory: "transaction",
      value: 50,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      organizationId: "org-1",
      // eventDate intentionally missing — previously crashed isInYearMonth(date.slice)
    },
    {
      id: "null-date",
      memberId: LEGACY_LOCAL_ID,
      eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
      eventCategory: "transaction",
      eventDate: null,
      value: 75,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      organizationId: "org-1",
    },
    {
      id: "ok-no-retailvp",
      memberId: LEGACY_LOCAL_ID,
      eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      eventCategory: "transaction",
      eventDate: "2026-08-10",
      value: 2000,
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      organizationId: "org-1",
      metadata: { customerName: "舊客", currencyCode: "TWD" },
      // missing metadata.retailVp — valid, contributes 0
    },
    {
      id: "ok-vp",
      memberId: LEGACY_LOCAL_ID,
      eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
      eventCategory: "transaction",
      eventDate: "2026-08-11",
      value: 40,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      organizationId: "org-1",
    },
    // valid fixture rows mixed in (legacy local id → must align to owner)
    ...fixture325(LEGACY_LOCAL_ID),
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

describe("organization load resilience (Product VP enrichment)", () => {
  it("A. normal organization + Product VP → organization loads with 325", () => {
    const entry = buildDownlineEntry(DOWNLINE_A, fixture325(), []);
    const cache: DownlineCloudDataCache = new Map([[DOWNLINE_A, entry]]);
    const roots = [
      orgNode(VIEWER, "Upline", [orgNode(DOWNLINE_A, "Downline A")]),
    ];

    const enriched = enrichOrganizationRootsWithProductVp({
      roots,
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: cache,
      downlineIds: [VIEWER, DOWNLINE_A],
    });

    expect(enriched).toHaveLength(1);
    expect(enriched[0]?.children[0]?.member.memberId).toBe(DOWNLINE_A);
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(325);
  });

  it("B. one downline has no Retail House data → organization loads", () => {
    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, [], [])],
    ]);
    const enriched = enrichOrganizationRootsWithProductVp({
      roots: [orgNode(VIEWER, "Upline", [orgNode(DOWNLINE_A, "A")])],
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: cache,
      downlineIds: [VIEWER, DOWNLINE_A],
    });
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(0);
  });

  it("C. malformed legacy Retail metadata / null holes → organization loads", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const entry = buildDownlineEntry(DOWNLINE_A, productionLegacyCrashBlob(DOWNLINE_A), []);
    const cache: DownlineCloudDataCache = new Map([[DOWNLINE_A, entry]]);

    expect(() =>
      enrichOrganizationRootsWithProductVp({
        roots: [orgNode(VIEWER, "Upline", [orgNode(DOWNLINE_A, "A")])],
        members: [],
        storage: memoryStorage(),
        viewerId: VIEWER,
        yearMonth: "2026-08",
        downlineCache: cache,
        downlineIds: [VIEWER, DOWNLINE_A],
      }),
    ).not.toThrow();

    const vp = getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", cache);
    // fixture325 aligned (325) + ok-vp (40); missing-date rows skipped; customer without retailVp = 0
    expect(vp).toBe(365);
    consoleSpy.mockRestore();
  });

  it("D. legacy memberId in cloud blob → organization loads and VP aligns", () => {
    const entry = buildDownlineEntry(DOWNLINE_A, fixture325(LEGACY_LOCAL_ID), []);
    expect(entry.events.every((e) => e.memberId === DOWNLINE_A)).toBe(true);
    expect(getDownlineMonthlyProductVp(DOWNLINE_A, "2026-08", new Map([[DOWNLINE_A, entry]]))).toBe(
      325,
    );
  });

  it("E. Product VP = 0 → organization loads", () => {
    const entry = buildDownlineEntry(
      DOWNLINE_A,
      [
        txEvent({
          id: "cust",
          memberId: DOWNLINE_A,
          eventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
          eventDate: "2026-08-01",
          value: 1000,
          // no retailVp
        }),
      ],
      [],
    );
    const enriched = enrichOrganizationRootsWithProductVp({
      roots: [orgNode(VIEWER, "Upline", [orgNode(DOWNLINE_A, "A")])],
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: new Map([[DOWNLINE_A, entry]]),
      downlineIds: [VIEWER, DOWNLINE_A],
    });
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(0);
  });

  it("F. Product VP > 0 appears on organization node", () => {
    const entry = buildDownlineEntry(DOWNLINE_A, fixture325(), []);
    const enriched = enrichOrganizationRootsWithProductVp({
      roots: [orgNode(VIEWER, "Upline", [orgNode(DOWNLINE_A, "A")])],
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: new Map([[DOWNLINE_A, entry]]),
      downlineIds: [VIEWER, DOWNLINE_A],
    });
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(325);
  });

  it("G. one enrichment record fails → core organization still loads", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Mixed: B empty, A has crash-blob + valid VP
    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, productionLegacyCrashBlob(DOWNLINE_A), [])],
      [DOWNLINE_B, buildDownlineEntry(DOWNLINE_B, [null, undefined, "x"] as never[], [])],
    ]);

    const enriched = enrichOrganizationRootsWithProductVp({
      roots: [
        orgNode(VIEWER, "Upline", [
          orgNode(DOWNLINE_A, "A"),
          orgNode(DOWNLINE_B, "B"),
        ]),
      ],
      members: [],
      storage: memoryStorage(),
      viewerId: VIEWER,
      yearMonth: "2026-08",
      downlineCache: cache,
      downlineIds: [VIEWER, DOWNLINE_A, DOWNLINE_B],
    });

    expect(enriched[0]?.children).toHaveLength(2);
    expect(enriched[0]?.children[0]?.member.monthlyVp).toBe(365);
    expect(enriched[0]?.children[1]?.member.monthlyVp).toBe(0);
    consoleSpy.mockRestore();
  });

  it("sanitize drops production crash entries without throwing", () => {
    expect(() => sanitizeBakiEventsForProductVp(productionLegacyCrashBlob(DOWNLINE_A))).not.toThrow();
    expect(() =>
      alignDownlineEventsToOwnerMemberId(
        productionLegacyCrashBlob(DOWNLINE_A) as BakiEvent[],
        DOWNLINE_A,
      ),
    ).not.toThrow();
    expect(() =>
      projectRetailTransactionsFromEvents(productionLegacyCrashBlob(DOWNLINE_A) as BakiEvent[]),
    ).not.toThrow();
    expect(() =>
      resolveMonthlyProductVpFromEvents({
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
        events: productionLegacyCrashBlob(DOWNLINE_A) as BakiEvent[],
      }),
    ).not.toThrow();
  });

  it("missing transactionDate no longer throws in canonical Product VP", () => {
    expect(
      calculateMonthlyProductVp({
        memberId: DOWNLINE_A,
        yearMonth: "2026-08",
        transactions: [
          {
            id: "x",
            memberId: DOWNLINE_A,
            transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
            transactionDate: undefined as never,
            amount: 100,
          },
        ],
      }),
    ).toBe(0);
  });

  it("batch still returns 325 for healthy member beside broken sibling", () => {
    const cache: DownlineCloudDataCache = new Map([
      [DOWNLINE_A, buildDownlineEntry(DOWNLINE_A, fixture325(), [])],
      [DOWNLINE_B, buildDownlineEntry(DOWNLINE_B, productionLegacyCrashBlob(DOWNLINE_B), [])],
    ]);
    const batch = getDownlineMonthlyProductVpBatch([DOWNLINE_A, DOWNLINE_B], "2026-08", cache);
    expect(batch.get(DOWNLINE_A)).toBe(325);
    expect(typeof batch.get(DOWNLINE_B)).toBe("number");
  });

  it("alignment copies events — does not mutate input objects", () => {
    const original = fixture325(LEGACY_LOCAL_ID);
    const before = original[0]!.memberId;
    alignDownlineEventsToOwnerMemberId(original, DOWNLINE_A);
    expect(original[0]!.memberId).toBe(before);
    expect(before).toBe(LEGACY_LOCAL_ID);
  });
});

describe("canonical Product VP still 325→350→250 after resilience", () => {
  it("edit and delete semantics unchanged", () => {
    let events = fixture325();
    expect(resolveMonthlyProductVpFromEvents({ memberId: DOWNLINE_A, yearMonth: "2026-08", events })).toBe(
      325,
    );
    events = events.map((e) =>
      e.id === "c2" ? { ...e, metadata: { ...e.metadata, retailVp: 150 } } : e,
    );
    expect(resolveMonthlyProductVpFromEvents({ memberId: DOWNLINE_A, yearMonth: "2026-08", events })).toBe(
      350,
    );
    events = events.filter((e) => e.id !== "c1");
    expect(resolveMonthlyProductVpFromEvents({ memberId: DOWNLINE_A, yearMonth: "2026-08", events })).toBe(
      250,
    );
  });
});
