/**
 * Sprint 16 validation — run: npx tsx scripts/validate-sprint16.ts
 */
import { RETAIL_TRANSACTION_TYPE_KEYS } from "../src/lib/business-engine/rules/keys";
import { APP_IDS, todayISODate } from "../src/lib/config/app-config";
import { processEventForCurrentMember } from "../src/lib/event-center/process-event";
import { createEventRepository } from "../src/lib/repositories/event-repository";
import type { StorageAdapter } from "../src/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "../src/lib/repositories/storage-keys";
import {
  getLatestComputedMetrics,
  recalculateMemberMetrics,
  type MemberComputedMetrics,
} from "../src/lib/services/recalculate-member-metrics";

class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const TRANSACTION_CASES = [
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    label: "新顧客",
    customerName: "王小明",
    value: 1200,
    currencyCode: "TWD",
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    label: "舊顧客",
    customerName: "李美華",
    value: 800,
    currencyCode: "TWD",
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    label: "新會員",
    customerName: "陳大同",
    value: 500,
    currencyCode: "VP",
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
    label: "舊會員",
    customerName: "林小芳",
    value: 300,
    currencyCode: "VP",
  },
] as const;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function hasEngineOutputs(metrics: MemberComputedMetrics): boolean {
  return (
    metrics.vp !== undefined &&
    metrics.missions !== undefined &&
    metrics.monthlyChallenge !== undefined &&
    metrics.qualificationResults !== undefined &&
    metrics.gamification !== undefined &&
    metrics.presidentAI !== undefined &&
    typeof metrics.computedAt === "string"
  );
}

function simulateHomepageLoad(storage: StorageAdapter): MemberComputedMetrics {
  return recalculateMemberMetrics(
    {
      memberId: APP_IDS.currentMemberId,
      referenceDate: todayISODate(),
    },
    storage,
  );
}

function main(): void {
  const storage = new MemoryStorageAdapter();
  const referenceDate = todayISODate();
  const baseline = recalculateMemberMetrics(
    {
      memberId: APP_IDS.currentMemberId,
      referenceDate,
    },
    storage,
  );

  console.log("Sprint 16 Validation\n");

  const createdKeys: string[] = [];
  let lastMetrics = baseline;

  for (const testCase of TRANSACTION_CASES) {
    lastMetrics = processEventForCurrentMember(
      {
        eventTypeKey: testCase.key,
        eventCategory: "transaction",
        eventDate: referenceDate,
        value: testCase.value,
        retailHouseKey: APP_IDS.defaultRetailHouseKey,
        metadata: {
          customerName: testCase.customerName,
          currencyCode: testCase.currencyCode,
        },
      },
      storage,
    );

    createdKeys.push(testCase.key);
    console.log(`✓ [1] ${testCase.label} (${testCase.key}) created successfully`);
  }

  const eventRepository = createEventRepository(storage);
  const allEvents = eventRepository.getAll();
  const transactionEvents = allEvents.filter(
    (event) =>
      event.eventCategory === "transaction" &&
      event.memberId === APP_IDS.currentMemberId,
  );

  assert(transactionEvents.length === 4, `[2] Expected 4 events in store, got ${transactionEvents.length}`);
  console.log(`✓ [2] Event Store contains ${transactionEvents.length} transaction events`);

  for (const testCase of TRANSACTION_CASES) {
    const stored = transactionEvents.find((event) => event.eventTypeKey === testCase.key);
    assert(Boolean(stored), `[2] Missing event for ${testCase.key}`);
    assert(
      stored?.metadata?.customerName === testCase.customerName,
      `[2] Customer name mismatch for ${testCase.key}`,
    );
    assert(stored?.value === testCase.value, `[2] Value mismatch for ${testCase.key}`);
  }
  console.log("✓ [2] All four event payloads verified in Event Store");

  assert(hasEngineOutputs(lastMetrics), "[3] Engine outputs missing from metrics");
  assert(
    lastMetrics.vp.totalVp >= baseline.vp.totalVp,
    `[3] VP did not update (${baseline.vp.totalVp} → ${lastMetrics.vp.totalVp})`,
  );
  assert(
    lastMetrics.retailHouse.houses[0]?.transactionCount === 4,
    `[3] Retail house transaction count expected 4, got ${lastMetrics.retailHouse.houses[0]?.transactionCount}`,
  );
  assert(
    lastMetrics.missions.dailyMissionSet !== undefined,
    "[3] Mission engine output missing dailyMissionSet",
  );
  assert(
    lastMetrics.monthlyChallenge.computedAt !== undefined &&
      lastMetrics.monthlyChallenge.computedAt !== null,
    "[3] Challenge engine output missing computedAt",
  );
  assert(
    lastMetrics.qualificationResults.length > 0,
    "[3] Qualification engine output missing results",
  );
  assert(
    lastMetrics.gamification.points !== undefined,
    "[3] Achievement engine output missing xp",
  );
  assert(
    lastMetrics.presidentAI.topPriorities !== undefined,
    "[3] President AI output missing priorities",
  );

  console.log("✓ [3] VP recalculated:", lastMetrics.vp.totalVp);
  console.log("✓ [3] Mission recalculated:", lastMetrics.missions.dailyMissionSet.missions.length, "daily missions");
  console.log("✓ [3] Challenge recalculated:", lastMetrics.monthlyChallenge.overallProgressPercent, "%");
  console.log("✓ [3] Qualification recalculated:", lastMetrics.qualificationResults.length, "rules");
  console.log("✓ [3] Achievement recalculated:", lastMetrics.gamification.achievements.length, "achievements");
  console.log("✓ [3] President AI recalculated:", lastMetrics.presidentAI.topPriorities.length, "priorities");

  const homepageMetrics = simulateHomepageLoad(storage);
  assert(
    homepageMetrics.vp.totalVp === lastMetrics.vp.totalVp,
    `[4] Homepage VP mismatch (${homepageMetrics.vp.totalVp} vs ${lastMetrics.vp.totalVp})`,
  );
  assert(
    homepageMetrics.eventCenter.totalEventCount === 4,
    `[4] Homepage event count mismatch (${homepageMetrics.eventCenter.totalEventCount})`,
  );
  console.log("✓ [4] Homepage load reflects latest VP and event count immediately");

  const persistedEventsRaw = storage.getItem(STORAGE_KEYS.bakiEvents);
  const persistedMetricsRaw = storage.getItem(STORAGE_KEYS.computedMetrics);
  assert(Boolean(persistedEventsRaw), "[5] Events not persisted in storage");
  assert(Boolean(persistedMetricsRaw), "[5] Computed metrics not persisted in storage");

  const refreshedMetrics = getLatestComputedMetrics(APP_IDS.currentMemberId, storage);
  assert(Boolean(refreshedMetrics), "[5] getLatestComputedMetrics returned null after refresh");
  assert(
    refreshedMetrics!.vp.totalVp === lastMetrics.vp.totalVp,
    `[5] Metrics VP lost after refresh (${refreshedMetrics!.vp.totalVp})`,
  );
  assert(
    createEventRepository(storage).getAll().length === 4,
    `[5] Events lost after refresh (${createEventRepository(storage).getAll().length})`,
  );

  const secondHomepageLoad = simulateHomepageLoad(storage);
  assert(
    secondHomepageLoad.vp.totalVp === lastMetrics.vp.totalVp,
    "[5] Homepage metrics lost after simulated refresh",
  );

  console.log("✓ [5] Events and metrics persist after refresh simulation");
  console.log("\nSprint16 PASSED");
}

try {
  main();
} catch (error) {
  console.error("\nSprint16 FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
