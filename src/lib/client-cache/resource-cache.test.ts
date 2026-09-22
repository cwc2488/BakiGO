import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CACHE_KEYS,
  RESOURCE_TTL,
  clearSensitiveResourceCache,
  ensureResourceCacheOwner,
  getCached,
  getResourceCacheOwner,
  invalidateCached,
  invalidateCachedPrefix,
  invalidateFivePlusFiveCaches,
  invalidateQuestionnaireCaches,
  isFresh,
  setCached,
} from "@/lib/client-cache/resource-cache";
import { isFullQuestionnaireLeadDetail } from "@/lib/questionnaire/client";

function src(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("resource-cache — member owner guard", () => {
  beforeEach(() => {
    clearSensitiveResourceCache();
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
  });

  afterEach(() => {
    clearSensitiveResourceCache();
  });

  it("A — member A cache is wiped when switching to B", () => {
    ensureResourceCacheOwner("member-a");
    setCached(CACHE_KEYS.questionnaireLead("lead-1"), {
      id: "lead-1",
      displayName: "小美",
      status: "new",
    });
    setCached(CACHE_KEYS.fivePlusFiveMe, {
      stats: { todayDate: "2026-09-22", fish: 5 },
      todayReport: null,
    });
    expect(getCached(CACHE_KEYS.questionnaireLead("lead-1"))?.data).toMatchObject({
      displayName: "小美",
    });

    ensureResourceCacheOwner("member-b");
    expect(getResourceCacheOwner()).toBe("member-b");
    expect(getCached(CACHE_KEYS.questionnaireLead("lead-1"))).toBeNull();
    expect(getCached(CACHE_KEYS.fivePlusFiveMe)).toBeNull();
  });

  it("B — logout clears questionnaire / 5＋5 / owner", () => {
    ensureResourceCacheOwner("member-a");
    setCached(CACHE_KEYS.questionnaireDashboard, { todayValidNewLeads: 1 });
    setCached(CACHE_KEYS.fivePlusFiveMe, { stats: {}, todayReport: null });
    clearSensitiveResourceCache();
    expect(getResourceCacheOwner()).toBeNull();
    expect(getCached(CACHE_KEYS.questionnaireDashboard)).toBeNull();
    expect(getCached(CACHE_KEYS.fivePlusFiveMe)).toBeNull();
  });

  it("C — same member keeps warm cache", () => {
    ensureResourceCacheOwner("member-a");
    setCached(CACHE_KEYS.questionnaireDashboard, { todayValidNewLeads: 3 });
    ensureResourceCacheOwner("member-a");
    expect(getCached(CACHE_KEYS.questionnaireDashboard)?.data).toEqual({
      todayValidNewLeads: 3,
    });
  });
});

describe("resource-cache — SWR primitives", () => {
  beforeEach(() => {
    clearSensitiveResourceCache();
    ensureResourceCacheOwner("member-test");
  });

  afterEach(() => {
    clearSensitiveResourceCache();
  });

  it("stale vs fresh TTL", () => {
    const key = CACHE_KEYS.questionnaireDashboard;
    setCached(key, { v: 1 });
    expect(isFresh(key, RESOURCE_TTL.questionnaireDashboard)).toBe(true);
    setCached(key, { v: 1 }, Date.now() - RESOURCE_TTL.questionnaireDashboard - 1);
    expect(isFresh(key, RESOURCE_TTL.questionnaireDashboard)).toBe(false);
    expect(getCached(key)?.data).toEqual({ v: 1 });
  });

  it("never uses localStorage for questionnaire PII keys", () => {
    const cacheSrc = src("src/lib/client-cache/resource-cache.ts");
    expect(cacheSrc).toContain("sessionStorage");
    expect(cacheSrc).not.toMatch(/localStorage\.setItem/);
    expect(cacheSrc).toContain("ensureResourceCacheOwner");
    expect(cacheSrc).toContain("clearSensitiveResourceCache");
    expect(cacheSrc).toContain("baki:rc:owner");
  });
});

describe("questionnaire performance UX — real TTL skip-fetch", () => {
  it("D/E — dashboard fresh skips fetch; stale refreshes", () => {
    const dash = src("src/components/questionnaire/QuestionnaireDashboardPage.tsx");
    expect(dash).toContain("isQuestionnaireDashboardFresh");
    expect(dash).toMatch(/if\s*\(!force\s*&&\s*hasData\s*&&\s*isQuestionnaireDashboardFresh/);
    expect(dash).toContain("更新失敗，顯示上次資料");
  });

  it("F — leads fresh skips fetch", () => {
    const page = src("src/components/questionnaire/QuestionnaireLeadsPage.tsx");
    expect(page).toContain("isQuestionnaireLeadsFresh");
    expect(page).toContain("SEARCH_DEBOUNCE_MS");
    expect(page).toContain("AbortController");
  });

  it("G — filter with no cache clears previous leads", () => {
    const page = src("src/components/questionnaire/QuestionnaireLeadsPage.tsx");
    expect(page).toContain("setLeads([])");
    expect(page).toContain("never show previous filter leads");
  });

  it("H/I — detail full fresh skips; summary still fetches", () => {
    const detail = src("src/components/questionnaire/QuestionnaireLeadDetailPage.tsx");
    expect(detail).toContain("isQuestionnaireLeadFullFresh");
    expect(detail).toContain("isFullQuestionnaireLeadDetail");
    expect(detail).toMatch(/if\s*\(!force\s*&&\s*fullFresh/);
  });

  it("J — 5＋5 fresh skips fetch", () => {
    const five = src("src/components/five-plus-five/FivePlusFiveMyReportPage.tsx");
    expect(five).toContain("isFivePlusFiveMeFresh");
    expect(five).toMatch(/if\s*\(!force\s*&&\s*hasCache\s*&&\s*isFivePlusFiveMeFresh/);
  });

  it("K — mutations invalidate caches", () => {
    const client = src("src/lib/questionnaire/client.ts");
    expect(client).toContain("invalidateFivePlusFiveCaches");
    expect(client).toContain("invalidateQuestionnaireCaches");
    expect(client).toContain("invalidateCached(CACHE_KEYS.questionnaireDashboard)");
    const fiveClient = src("src/lib/five-plus-five/client.ts");
    expect(fiveClient).toContain("invalidateFivePlusFiveCaches");
  });

  it("auth wires owner guard + logout clear", () => {
    const auth = src("src/lib/auth/auth-context.tsx");
    expect(auth).toContain("ensureResourceCacheOwner");
    expect(auth).toContain("clearSensitiveResourceCache");
    expect(auth).toContain("signOut");
  });

  it("public survey does not touch private resource cache", () => {
    const pub = src("src/components/questionnaire/PublicSurveyPage.tsx");
    expect(pub).not.toContain("resource-cache");
    expect(pub).not.toContain("setCached");
    expect(pub).not.toContain("questionnaire:dashboard");
  });

  it("isFullQuestionnaireLeadDetail distinguishes summary", () => {
    expect(
      isFullQuestionnaireLeadDetail({
        id: "1",
        displayName: "小美",
        primaryNeed: null,
        needTags: [],
        interestLevel: null,
        usesSupplements: null,
        status: "new",
        lastResponseAt: "2026-09-22T00:00:00Z",
        lastSource: "online",
      }),
    ).toBe(false);
    expect(
      isFullQuestionnaireLeadDetail({
        id: "1",
        displayName: "小美",
        primaryNeed: null,
        needTags: [],
        interestLevel: null,
        usesSupplements: null,
        status: "new",
        lastResponseAt: "2026-09-22T00:00:00Z",
        lastSource: "online",
        contactType: "line",
        contactValue: "x",
        supplementDetails: null,
        firstSource: "online",
        firstResponseAt: "2026-09-22T00:00:00Z",
        responseCount: 1,
        fishCreditedAt: null,
        invitationStartedAt: null,
        invitationCreditedAt: null,
        latestResponse: null,
        recentResponses: [],
      }),
    ).toBe(true);
  });
});

describe("migration 087 — dashboard index + delete hardening", () => {
  const sql = src("supabase/migrations/087_questionnaire_delete_performance.sql");

  it("L/M — dashboard uses timestamptz ranges, not per-row ::date", () => {
    expect(sql).toContain("v_today_start");
    expect(sql).toContain("v_tomorrow_start");
    expect(sql).toContain("v_week_start");
    expect(sql).toContain("fish_credited_at >= v_today_start");
    expect(sql).toContain("fish_credited_at < v_tomorrow_start");
    expect(sql).toContain("fish_credited_at >= v_week_start");
    expect(sql).not.toMatch(
      /\(fish_credited_at\s+at\s+time\s+zone\s+'Asia\/Taipei'\)::date/,
    );
  });

  it("N/O/P — delete reverse only when component > 0; no ghost report", () => {
    expect(sql).toContain("questionnaire_fish_pool_count > 0");
    expect(sql).toContain("questionnaire_invitation_five_steps_count > 0");
    expect(sql).toContain("credit_report_missing");
    expect(sql).toContain("returning id into");
    // Must not INSERT ghost rows on delete path
    expect(sql).not.toMatch(
      /if v_lead\.fish_credited_at[\s\S]*?insert into public\.five_plus_five_reports/,
    );
    expect(sql).not.toMatch(/manual_fish_pool_count\s*=\s*greatest/);
    expect(sql).not.toMatch(/manual_invitation_five_steps_count\s*=\s*greatest/);
  });

  it("service maps credit_report_missing", () => {
    const service = src("src/lib/questionnaire/service.ts");
    expect(service).toContain("credit_report_missing");
  });
});
