import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("UX-2 performance architecture", () => {
  it("PERF-01 — Referral Center loads via batch Promise.all (no N+1 loop)", () => {
    const service = readSrc("src/lib/coaching/referral-share/referral-center-service.ts");
    expect(service).toContain("Promise.all");
    expect(service).toContain("Batch queries only");
    // No per-customer await inside map of customers
    expect(service).not.toMatch(/for\s*\([^)]*customers[\s\S]*?await\s+/);
    expect(service).toContain("from(\"customers\")");
    expect(service).toContain("from(\"growth_opportunities\")");
    expect(service).toContain("listGrowthSharesForOwner");
    expect(service).toContain("listAttributionsForOwner");
  });

  it("PERF-02 — Command Center uses fixed parallel batch after enrollments", () => {
    const batch = readSrc("src/lib/coaching/attention/load-command-center-batch.ts");
    expect(batch).toContain("parallelBatch: true");
    expect(batch).toContain("Promise.all");
    expect(batch).toContain("nPlusOne: false");
    expect(batch).toContain("listActiveCoachingEnrollments");
    // Five dependent queries after enrollments are parallelized
    expect(batch).toMatch(/Promise\.all\(\[[\s\S]*customers[\s\S]*coaching_daily_logs/);
  });

  it("PERF-03 — Growth Detail normal load does not reconcile/write", () => {
    const panel = readSrc("src/components/coaching/CoachingGrowthPanel.tsx");
    expect(panel).toContain("void load(false)");
    expect(panel).toContain("avoid reconcile=1");
    expect(panel).toMatch(/load\(true\)/); // only explicit re-evaluate
    const route = readSrc("src/app/api/coaching/enrollments/[enrollmentId]/growth/route.ts");
    // reconcile gated by query param
    expect(route).toMatch(/reconcile/);
  });

  it("PERF-04 — secondary Detail panels do not block bootstrap", () => {
    const detail = readSrc("src/components/coaching/CoachingDetailPage.tsx");
    // UX-IA: Layer 4 deferred — Growth / Coach Actions / Timeline load only after expand.
    expect(detail).toContain("loadMorePanels");
    expect(detail).toContain("setLoadMorePanels(true)");
    expect(detail).toContain("DETAIL_MORE_DEFAULT_OPEN");
    expect(detail).toMatch(/loadMorePanels \?[\s\S]*CoachingGrowthPanel/);
    expect(detail).toMatch(/loadMorePanels \?[\s\S]*CoachingCoachActionPanel/);
    expect(detail).toMatch(/showMore \?[\s\S]*CoachingTimelinePanel/);
    const route = readSrc("src/app/api/coaching/enrollments/[enrollmentId]/route.ts");
    expect(route).toContain("secondaryPanelsDeferred: true");
    expect(route).toContain("includesRecentLogs: false");
    expect(route).toContain("recentLogs: []");
    expect(route).toContain("Promise.all");
  });

  it("PERF-05 — Home first paint uses cache; downline cloud is progressive", () => {
    const home = readSrc("src/components/home/HomePage.tsx");
    expect(home).toContain("readMissionControlMetrics");
    expect(home).not.toContain("replaceLocalMembersFromCloud");
    expect(home).toContain("includeMapUniverse: false");
    // Partner V2: downline KPI cloud enrich runs in useEffect after first render.
    expect(home).toContain("useEffect");
    expect(home).toMatch(/fetchDownlineCloudData[\s\S]*useEffect|useEffect[\s\S]*fetchDownlineCloudData/);
  });

  it("PERF-06 — Calendar shared sync window is explicitly bounded", () => {
    const sync = readSrc("src/lib/calendar/sync-shared-calendars.ts");
    expect(sync).toContain("SHARED_CALENDAR_SYNC_RANGE_DAYS");
    expect(sync).toContain("getSharedCalendarSyncRange");
    const match = sync.match(/SHARED_CALENDAR_SYNC_RANGE_DAYS\s*=\s*(\d+)/);
    expect(match).toBeTruthy();
    const days = Number(match![1]);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(180);
  });

  it("PERF — Command Center Growth reconcile starts after response payload", () => {
    const route = readSrc("src/app/api/coaching/command-center/route.ts");
    const responseIdx = route.indexOf("NextResponse.json");
    const reconcileIdx = route.indexOf("triggerGrowthReconcileBestEffort");
    expect(responseIdx).toBeGreaterThan(-1);
    expect(reconcileIdx).toBeGreaterThan(responseIdx);
  });

  it("PERF — Customer list groups body records once", () => {
    const list = readSrc("src/components/customers/CustomerListPage.tsx");
    expect(list).toContain("getBodyRecordsGroupedByCustomer");
    expect(list).not.toContain("getBodyRecordsByCustomer");
  });
});
