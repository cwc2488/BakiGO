import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_IDS } from "@/lib/config/app-config";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { buildRetailHouseView } from "@/lib/retail-house/build-retail-house-view";
import { calculateMonthlyProductVp } from "@/lib/retail-house/canonical-product-vp";
import {
  bootstrapRetailHousePage,
  loadRetailHouseMetrics,
  RETAIL_HOUSE_LOAD_WATCHDOG_MS,
} from "@/lib/retail-house/retail-house-bootstrap";
import { resolveRetailHouseDateRange } from "@/lib/retail-house/retail-house-date-range";
import {
  addRetailTransactionDeletionTombstone,
  readRetailTransactionDeletionTombstoneIds,
} from "@/lib/retail-house/retail-transaction-deletion-tombstones";
import { deleteRetailTransactionForCurrentMember } from "@/lib/retail-house/retail-transaction-service";
import { loadMissionControlMetrics } from "@/lib/mission-control/format";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";

const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TX_ID = "tx-loading-regression";
const TX_DELETED = "tx-deleted-only";

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

function memberRow(id = MEMBER_B) {
  return {
    id,
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
  };
}

function authSeed(storage: StorageAdapter, options?: { includeMember?: boolean }) {
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
  if (options?.includeMember !== false) {
    storage.setItem(STORAGE_KEYS.members, JSON.stringify([memberRow()]));
  } else {
    storage.setItem(STORAGE_KEYS.members, JSON.stringify([]));
  }
  storage.setItem(STORAGE_KEYS.eventsMigrated, "true");
}

function eventRow(id = TX_ID, overrides: Partial<BakiEvent> = {}): BakiEvent {
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
    ...overrides,
  };
}

function pageSource(): string {
  return readFileSync(resolve(process.cwd(), "src/components/retail-house/RetailHousePage.tsx"), "utf8");
}

function bootstrapSource(): string {
  return readFileSync(
    resolve(process.cwd(), "src/lib/retail-house/retail-house-bootstrap.ts"),
    "utf8",
  );
}

describe("REQUIRED — Retail House loading lifecycle (permanent spinner regression)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("A — normal Retail House with data reaches usable UI snapshot", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([eventRow()]),
    });
    authSeed(storage);

    const result = bootstrapRetailHousePage({ storage, memberId: MEMBER_B });
    expect(result.phase).toBe("loaded");
    expect(result.metrics).not.toBeNull();

    const range = resolveRetailHouseDateRange("month", "2026-08-31");
    const view = buildRetailHouseView(result.metrics!, range, storage);
    const items = view.quadrants.flatMap((q) => q.weeklyItems);
    expect(items.some((item) => item.transactionId === TX_ID)).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("B — no Retail House data reaches loaded empty presentation", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([]),
    });
    authSeed(storage);

    const result = bootstrapRetailHousePage({ storage, memberId: MEMBER_B });
    expect(result.phase).toBe("loaded");
    expect(result.metrics).not.toBeNull();

    const range = resolveRetailHouseDateRange("month", "2026-08-31");
    const view = buildRetailHouseView(result.metrics!, range, storage);
    const items = view.quadrants.flatMap((q) => q.weeklyItems);
    expect(items).toHaveLength(0);
  });

  it("C — only deleted / tombstoned records reach active-filtered empty state", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([eventRow(TX_DELETED)]),
    });
    authSeed(storage);
    addRetailTransactionDeletionTombstone(storage, {
      transactionId: TX_DELETED,
      memberId: MEMBER_B,
    });

    const result = bootstrapRetailHousePage({ storage, memberId: MEMBER_B });
    expect(result.phase).toBe("loaded");

    const range = resolveRetailHouseDateRange("month", "2026-08-31");
    const view = buildRetailHouseView(result.metrics!, range, storage);
    const items = view.quadrants.flatMap((q) => q.weeklyItems);
    expect(items.some((item) => item.transactionId === TX_DELETED)).toBe(false);
    expect(readRetailTransactionDeletionTombstoneIds(storage).has(TX_DELETED)).toBe(true);
  });

  it("D — slow data response still resolves (loading is temporary)", async () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([eventRow()]),
    });
    authSeed(storage);

    const started = performance.now();
    await new Promise((r) => setTimeout(r, 25));
    const result = bootstrapRetailHousePage({ storage, memberId: MEMBER_B });
    const elapsed = performance.now() - started;

    expect(result.phase).toBe("loaded");
    expect(result.metrics).not.toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });

  it("E — failed metrics load settles into recoverable error (never permanent loading)", () => {
    const storage = memoryStorage();
    authSeed(storage);

    // Force bootstrap failure by making storage.setItem throw during saveComputedMetrics.
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === STORAGE_KEYS.computedMetrics) {
        throw new Error("QuotaExceededError");
      }
      originalSetItem(key, value);
    };

    const result = bootstrapRetailHousePage({
      storage,
      memberId: MEMBER_B,
      preferCache: false,
    });
    expect(result.phase).toBe("error");
    expect(result.metrics).toBeNull();
    expect(result.stage).toBe("data_fetch_failed");
    expect(result.errorMessage).toBe("零售屋暫時載入失敗");
  });

  it("F — hung-path safety: page exposes bounded watchdog (not infinite spinner)", () => {
    const page = pageSource();
    const boot = bootstrapSource();
    const pageStates = readFileSync(
      resolve(process.cwd(), "src/components/ui/PageStates.tsx"),
      "utf8",
    );
    expect(boot).toContain("RETAIL_HOUSE_LOAD_WATCHDOG_MS");
    expect(RETAIL_HOUSE_LOAD_WATCHDOG_MS).toBeGreaterThan(5_000);
    expect(RETAIL_HOUSE_LOAD_WATCHDOG_MS).toBeLessThanOrEqual(30_000);
    expect(page).toContain("RETAIL_HOUSE_LOAD_WATCHDOG_MS");
    expect(page).toContain("零售屋暫時載入失敗");
    expect(page).toContain("PageErrorState");
    expect(pageStates).toContain("重新載入");
    expect(page).toContain('phase === "error"');
  });

  it("G — session/member race: missing local member still settles (no permanent loading)", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([
        eventRow(TX_ID, { eventDate: "2026-09-01" }),
      ]),
    });
    authSeed(storage, { includeMember: false });

    // Pre-fix page called loadMissionControlMetrics() with no try/catch and
    // default MapUniverse=true. Lightweight bootstrap must still settle.
    const result = bootstrapRetailHousePage({
      storage,
      memberId: MEMBER_B,
      preferCache: false,
    });
    expect(result.phase).toBe("loaded");
    expect(result.metrics?.memberId).toBe(MEMBER_B);
    expect(result.metrics?.mapUniverse.lines).toHaveLength(0);
  });

  it("H — navigate away/back: page cancels stale loads via generation guard", () => {
    const page = pageSource();
    expect(page).toContain("loadGenerationRef");
    expect(page).toContain("generation !== loadGenerationRef.current");
    expect(page).toContain("applyBootstrap");
    // Soft refresh must not wipe usable UI on failure.
    expect(page).toContain("soft && metricsRef.current");
  });

  it("I — delete remains reconciled after bootstrap reopen", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([
        eventRow(TX_ID, { eventDate: "2026-09-01" }),
      ]),
      [STORAGE_KEYS.retailTransactions]: JSON.stringify([]),
    });
    authSeed(storage);

    deleteRetailTransactionForCurrentMember(TX_ID, storage);

    const result = bootstrapRetailHousePage({ storage, memberId: MEMBER_B });
    expect(result.phase).toBe("loaded");
    const range = resolveRetailHouseDateRange("month", "2026-09-01");
    const view = buildRetailHouseView(result.metrics!, range, storage);
    const items = view.quadrants.flatMap((q) => q.weeklyItems);
    expect(items.some((item) => item.transactionId === TX_ID)).toBe(false);
    expect(readRetailTransactionDeletionTombstoneIds(storage).has(TX_ID)).toBe(true);
  });

  it("J — legacy/canonical Product VP preserved while page loads", () => {
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify([
        eventRow(TX_ID, { eventDate: "2026-09-01" }),
      ]),
    });
    authSeed(storage);

    const result = bootstrapRetailHousePage({ storage, memberId: MEMBER_B });
    expect(result.phase).toBe("loaded");
    expect(result.metrics?.productVp.yearMonth).toBe("2026-09");
    expect(result.metrics?.productVp.monthlyTotal).toBe(150);
    expect(
      calculateMonthlyProductVp({
        memberId: MEMBER_B,
        yearMonth: "2026-09",
        transactions: [
          {
            id: TX_ID,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            organizationId: APP_IDS.organizationId,
            memberId: MEMBER_B,
            customerName: "小美",
            transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
            transactionDate: "2026-09-01",
            amount: 5000,
            currencyCode: "TWD",
            retailHouseKey: APP_IDS.defaultRetailHouseKey,
            metadata: { customerName: "小美", currencyCode: "TWD", retailVp: 150 },
          },
        ],
      }),
    ).toBe(150);
  });

  it("architecture — RH bootstrap never awaits network / MapUniverse", () => {
    const page = pageSource();
    const boot = bootstrapSource();
    expect(boot).toContain("includeMapUniverse: false");
    expect(boot).toContain("loadRetailHouseMetrics");
    expect(page).toContain("bootstrapRetailHousePage");
    expect(page).not.toMatch(/loadMissionControlMetrics\s*\(/);
    expect(page).not.toContain("ensureOwnRetailTransactionsReconciled");
    expect(page).not.toContain("fetchCloudAppData");
    // Mutations also skip MapUniverse
    const service = readFileSync(
      resolve(process.cwd(), "src/lib/retail-house/retail-transaction-service.ts"),
      "utf8",
    );
    expect(service).toContain("includeMapUniverse: false");
  });

  it("performance — lightweight RH load avoids MapUniverse leader-forest work", () => {
    const downlines = Array.from({ length: 12 }, (_, i) => ({
      id: `downline-${i}`,
      organizationId: APP_IDS.organizationId,
      displayName: `D${i}`,
      herbalifeMemberId: `D${i}`,
      email: `d${i}@example.com`,
      rankKey: "new_member",
      roleKey: "member",
      status: "active",
      joinedAt: "2026-01-01",
      sponsorMemberId: MEMBER_B,
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const storage = memoryStorage({
      [STORAGE_KEYS.bakiEvents]: JSON.stringify(
        Array.from({ length: 8 }, (_, i) =>
          eventRow(`tx-perf-${i}`, {
            eventDate: `2026-09-0${(i % 9) + 1}`,
            metadata: {
              customerName: `C${i}`,
              currencyCode: "TWD",
              retailVp: 10 + i,
            },
          }),
        ),
      ),
      [STORAGE_KEYS.members]: JSON.stringify([memberRow(), ...downlines]),
      [STORAGE_KEYS.authSession]: JSON.stringify({
        memberId: MEMBER_B,
        memberNumber: "B001",
        herbalifeMemberId: "B001",
        email: "b@example.com",
        signedInAt: "2026-08-01T00:00:00.000Z",
      }),
      [STORAGE_KEYS.eventsMigrated]: "true",
    });

    const lightStart = performance.now();
    const light = loadRetailHouseMetrics(storage, MEMBER_B);
    const lightMs = performance.now() - lightStart;

    const heavyStart = performance.now();
    const heavy = loadMissionControlMetrics(MEMBER_B, storage, undefined, {
      includeMapUniverse: true,
    });
    const heavyMs = performance.now() - heavyStart;

    expect(light.mapUniverse.lines).toHaveLength(0);
    expect(heavy.mapUniverse.lines.length).toBeGreaterThan(0);
    // Lightweight path should not be slower than full MapUniverse path.
    expect(lightMs).toBeLessThanOrEqual(heavyMs + 15);
  });
});
