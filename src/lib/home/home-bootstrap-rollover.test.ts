import { afterEach, describe, expect, it, vi } from "vitest";
import * as appConfig from "@/lib/config/app-config";
import { APP_IDS } from "@/lib/config/app-config";
import {
  loadMissionControlMetrics,
  readMissionControlMetrics,
} from "@/lib/mission-control/format";
import { buildDailyActionSnapshot } from "@/lib/daily-action/daily-action-selectors";
import { buildHomeProgressView } from "@/lib/home/my-home-presentation";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { recalculateMemberMetrics, type MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import type { RetailTransaction } from "@/types/retail-transaction";

const MEMBER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

function seedAuthOnly(storage: StorageAdapter) {
  storage.setItem(
    STORAGE_KEYS.authSession,
    JSON.stringify({
      memberId: MEMBER_ID,
      memberNumber: "B001",
      herbalifeMemberId: "B001",
      email: "b@example.com",
      signedInAt: "2026-08-31T12:00:00.000Z",
    }),
  );
  storage.setItem(
    STORAGE_KEYS.members,
    JSON.stringify([
      {
        id: MEMBER_ID,
        organizationId: APP_IDS.organizationId,
        displayName: "測試夥伴",
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
  storage.setItem(STORAGE_KEYS.bakiEvents, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify([]));
}

function seedProductionLikeAugust(storage: StorageAdapter) {
  seedAuthOnly(storage);
  // August activity — realistic historical month
  processEventForCurrentMember(
    {
      eventTypeKey: ACTIVITY_EVENT_KEYS.MEASUREMENT,
      eventCategory: "activity",
      eventDate: "2026-08-15",
      metadata: { customerName: "八月量測" },
    },
    storage,
  );
  processEventForCurrentMember(
    {
      eventTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
      eventCategory: "activity",
      eventDate: "2026-08-20",
      metadata: { customerName: "八月諮詢" },
    },
    storage,
  );

  const augustMetrics = recalculateMemberMetrics(
    { memberId: MEMBER_ID, referenceDate: "2026-08-31", includeMapUniverse: false },
    storage,
  );
  expect(augustMetrics.yearMonth).toBe("2026-08");
  expect(augustMetrics.missions.referenceDate).toBe("2026-08-31");
  return augustMetrics;
}

/** Legacy persisted metrics missing missions.referenceDate (pre-mission-engine cache). */
function seedLegacyMetricsWithoutReferenceDate(storage: StorageAdapter) {
  seedProductionLikeAugust(storage);
  const raw = storage.getItem(STORAGE_KEYS.computedMetrics);
  const parsed = JSON.parse(raw ?? "[]") as MemberComputedMetrics[];
  const broken = {
    ...parsed[0],
    missions: {} as MemberComputedMetrics["missions"],
  };
  storage.setItem(STORAGE_KEYS.computedMetrics, JSON.stringify([broken]));
}

describe("Home bootstrap — August persisted → September 1 Taipei", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("readMissionControlMetrics rejects stale day without throwing", () => {
    const storage = memoryStorage();
    seedProductionLikeAugust(storage);

    vi.spyOn(appConfig, "todayISODate").mockReturnValue("2026-09-01");

    expect(() => readMissionControlMetrics(MEMBER_ID, storage)).not.toThrow();
    expect(readMissionControlMetrics(MEMBER_ID, storage)).toBeNull();
  });

  it("loadMissionControlMetrics recomputes valid September Home metrics (empty month)", () => {
    const storage = memoryStorage();
    seedProductionLikeAugust(storage);

    vi.spyOn(appConfig, "todayISODate").mockReturnValue("2026-09-01");

    const metrics = loadMissionControlMetrics(MEMBER_ID, storage, undefined, {
      includeMapUniverse: false,
    });

    expect(metrics.yearMonth).toBe("2026-09");
    expect(metrics.missions.referenceDate).toBe("2026-09-01");

    const daily = buildDailyActionSnapshot(metrics, storage);
    expect(daily.monthlyMeasurement.current).toBe(0);
    expect(daily.monthlyConsultation.current).toBe(0);

    const progress = buildHomeProgressView(metrics, daily);
    expect(progress.rows.some((r) => r.label === "本月量測")).toBe(true);
    expect(progress.rows.find((r) => r.label === "本月量測")?.value).toMatch(/^0/);
  });

  it("loadMissionControlMetrics with legacy retail transactions (August VP) → September empty month", () => {
    const storage = memoryStorage();
    seedProductionLikeAugust(storage);

    const legacy: RetailTransaction = {
      id: "tx-legacy-aug",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
      organizationId: APP_IDS.organizationId,
      memberId: MEMBER_ID,
      customerName: "小美",
      transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      transactionDate: "2026-08-10",
      amount: 5000,
      currencyCode: "TWD",
      retailHouseKey: APP_IDS.defaultRetailHouseKey,
      metadata: { customerName: "小美", currencyCode: "TWD", retailVp: 150 },
    };
    storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify([legacy]));

    vi.spyOn(appConfig, "todayISODate").mockReturnValue("2026-09-01");

    const metrics = loadMissionControlMetrics(MEMBER_ID, storage, undefined, {
      includeMapUniverse: false,
    });
    expect(metrics.yearMonth).toBe("2026-09");
    expect(metrics.productVp.monthlyTotal).toBe(0);
    const daily = buildDailyActionSnapshot(metrics, storage);
    expect(daily.monthlyMeasurement.current).toBe(0);
  });

  it("member session id missing from members table still recomputes September", () => {
    const storage = memoryStorage();
    seedProductionLikeAugust(storage);
    storage.setItem(
      STORAGE_KEYS.members,
      JSON.stringify([]),
    );

    vi.spyOn(appConfig, "todayISODate").mockReturnValue("2026-09-01");

    const metrics = loadMissionControlMetrics(MEMBER_ID, storage, undefined, {
      includeMapUniverse: false,
    });
    expect(metrics.yearMonth).toBe("2026-09");
  });

  it("smoke-style partial August cache rejects then recomputes September", () => {
    const storage = memoryStorage();
    seedAuthOnly(storage);

    storage.setItem(
      STORAGE_KEYS.computedMetrics,
      JSON.stringify([
        {
          memberId: MEMBER_ID,
          yearMonth: "2026-08",
          computedAt: "2026-08-31T15:00:00.000Z",
          missions: { referenceDate: "2026-08-31" },
          productVp: { yearMonth: "2026-08", monthlyTotal: 0 },
          vp: { totalVp: 0 },
          monthlyChallenge: { criteria: [] },
          nextSteps: [],
          presidentAI: { topPriorities: [], focusMode: { label: "" } },
        },
      ]),
    );

    vi.spyOn(appConfig, "todayISODate").mockReturnValue("2026-09-01");

    expect(readMissionControlMetrics(MEMBER_ID, storage)).toBeNull();
    const metrics = loadMissionControlMetrics(MEMBER_ID, storage, undefined, {
      includeMapUniverse: false,
    });
    expect(metrics.missions.referenceDate).toBe("2026-09-01");
    const daily = buildDailyActionSnapshot(metrics, storage);
    expect(() => buildHomeProgressView(metrics, daily)).not.toThrow();
  });

  it("legacy cache without missions object must not throw read path", () => {
    const storage = memoryStorage();
    seedProductionLikeAugust(storage);
    const raw = storage.getItem(STORAGE_KEYS.computedMetrics);
    const parsed = JSON.parse(raw ?? "[]") as MemberComputedMetrics[];
    const broken = { ...parsed[0], missions: undefined as unknown as MemberComputedMetrics["missions"] };
    storage.setItem(STORAGE_KEYS.computedMetrics, JSON.stringify([broken]));

    vi.spyOn(appConfig, "todayISODate").mockReturnValue("2026-09-01");

    expect(() => readMissionControlMetrics(MEMBER_ID, storage)).not.toThrow();
    expect(readMissionControlMetrics(MEMBER_ID, storage)).toBeNull();
    const metrics = loadMissionControlMetrics(MEMBER_ID, storage, undefined, {
      includeMapUniverse: false,
    });
    expect(metrics.missions.referenceDate).toBe("2026-09-01");
  });

  it("metrics persistence failure (quota) still returns September snapshot for Home", () => {
    const storage = memoryStorage();
    seedProductionLikeAugust(storage);
    const underlying = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === STORAGE_KEYS.computedMetrics) {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      underlying(key, value);
    };

    vi.spyOn(appConfig, "todayISODate").mockReturnValue("2026-09-01");

    const metrics = loadMissionControlMetrics(MEMBER_ID, storage, undefined, {
      includeMapUniverse: false,
    });
    expect(metrics.yearMonth).toBe("2026-09");
    const daily = buildDailyActionSnapshot(metrics, storage);
    expect(() => buildHomeProgressView(metrics, daily)).not.toThrow();
  });
});
