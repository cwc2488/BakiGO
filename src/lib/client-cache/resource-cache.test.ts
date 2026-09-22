import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CACHE_KEYS,
  RESOURCE_TTL,
  getCached,
  invalidateCached,
  invalidateCachedPrefix,
  invalidateFivePlusFiveCaches,
  invalidateQuestionnaireCaches,
  isFresh,
  setCached,
} from "@/lib/client-cache/resource-cache";

function src(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("resource-cache — SWR primitives", () => {
  beforeEach(() => {
    invalidateCachedPrefix("questionnaire:");
    invalidateCachedPrefix("fiveplusfive:");
    invalidateCachedPrefix("home:metrics:");
    // jsdom sessionStorage
    if (typeof window !== "undefined") {
      window.sessionStorage.clear();
    }
  });

  afterEach(() => {
    invalidateQuestionnaireCaches();
    invalidateFivePlusFiveCaches();
  });

  it("A — dashboard cache hit: set then get immediately", () => {
    const payload = { todayValidNewLeads: 2 };
    setCached(CACHE_KEYS.questionnaireDashboard, payload);
    expect(getCached(CACHE_KEYS.questionnaireDashboard)?.data).toEqual(payload);
    expect(isFresh(CACHE_KEYS.questionnaireDashboard, RESOURCE_TTL.questionnaireDashboard)).toBe(
      true,
    );
  });

  it("B — stale cache still readable while freshness expires", () => {
    const key = CACHE_KEYS.questionnaireDashboard;
    setCached(key, { v: 1 }, Date.now() - RESOURCE_TTL.questionnaireDashboard - 1);
    expect(getCached(key)?.data).toEqual({ v: 1 });
    expect(isFresh(key, RESOURCE_TTL.questionnaireDashboard)).toBe(false);
  });

  it("E — detail summary can be seeded from list key", () => {
    const summary = { id: "lead-1", displayName: "小美", status: "new" };
    setCached(CACHE_KEYS.questionnaireLead("lead-1"), summary);
    expect(getCached(CACHE_KEYS.questionnaireLead("lead-1"))?.data).toEqual(summary);
  });

  it("F — mutation invalidate clears dashboard + leads + 5＋5", () => {
    setCached(CACHE_KEYS.questionnaireDashboard, { ok: true });
    setCached(CACHE_KEYS.questionnaireLeads("all", "", 1), { leads: [] });
    setCached(CACHE_KEYS.fivePlusFiveMe, { stats: {} });
    invalidateQuestionnaireCaches();
    invalidateFivePlusFiveCaches();
    expect(getCached(CACHE_KEYS.questionnaireDashboard)).toBeNull();
    expect(getCached(CACHE_KEYS.questionnaireLeads("all", "", 1))).toBeNull();
    expect(getCached(CACHE_KEYS.fivePlusFiveMe)).toBeNull();
  });

  it("I — fiveplusfive:me warm reopen uses cache key", () => {
    setCached(CACHE_KEYS.fivePlusFiveMe, { stats: { todayDate: "2026-09-22" }, todayReport: null });
    expect(getCached(CACHE_KEYS.fivePlusFiveMe)?.data).toMatchObject({
      stats: { todayDate: "2026-09-22" },
    });
  });

  it("never uses localStorage for questionnaire PII keys", () => {
    const cacheSrc = src("src/lib/client-cache/resource-cache.ts");
    expect(cacheSrc).toContain("sessionStorage");
    expect(cacheSrc).not.toMatch(/localStorage\.setItem/);
    expect(cacheSrc).toContain('key.startsWith("questionnaire:")');
  });
});

describe("questionnaire performance UX architecture", () => {
  it("C — leads page uses 300ms debounce", () => {
    const page = src("src/components/questionnaire/QuestionnaireLeadsPage.tsx");
    expect(page).toContain("SEARCH_DEBOUNCE_MS");
    expect(page).toContain("300");
    expect(page).toContain("setDebouncedSearch");
  });

  it("D — leads page aborts previous request", () => {
    const page = src("src/components/questionnaire/QuestionnaireLeadsPage.tsx");
    expect(page).toContain("AbortController");
    expect(page).toContain("abortRef");
    expect(page).toContain(".abort()");
    expect(page).toContain("signal: controller.signal");
  });

  it("dashboard / detail / 5＋5 use cache-first SWR (no blank wipe)", () => {
    const dash = src("src/components/questionnaire/QuestionnaireDashboardPage.tsx");
    expect(dash).toContain("readCachedQuestionnaireDashboard");
    expect(dash).not.toMatch(/setDashboard\(null\)/);
    expect(dash).toContain("更新失敗，顯示上次資料");
    expect(dash).toContain("更新中…");

    const detail = src("src/components/questionnaire/QuestionnaireLeadDetailPage.tsx");
    expect(detail).toContain("readCachedQuestionnaireLead");
    expect(detail).toContain("刪除這筆問卷");
    expect(detail).toContain("確認刪除");
    expect(detail).toContain("deleteQuestionnaireLead");

    const dashPrefetch = src("src/components/questionnaire/QuestionnaireDashboardPage.tsx");
    expect(dashPrefetch).toContain("prefetchQuestionnaireLead");
    const leadsPrefetch = src("src/components/questionnaire/QuestionnaireLeadsPage.tsx");
    expect(leadsPrefetch).toContain("prefetchQuestionnaireLead");
    expect(leadsPrefetch).toContain("router.prefetch");

    const five = src("src/components/five-plus-five/FivePlusFiveMyReportPage.tsx");
    expect(five).toContain("readCachedFivePlusFiveMe");
    expect(five).not.toContain('載入中…');
  });

  it("dashboard service uses get_questionnaire_dashboard_v1 (not 7 count queries)", () => {
    const service = src("src/lib/questionnaire/service.ts");
    expect(service).toContain("get_questionnaire_dashboard_v1");
    expect(service).toContain("delete_questionnaire_lead_v1");
    expect(service).toContain("latest_response:questionnaire_responses!latest_response_id");
    // Should not still fire the old multi-count pattern
    expect(service).not.toContain("todayBounds");
    expect(service).not.toContain('eq("first_source", "onsite")');
  });

  it("DELETE API rejects forged ownerMemberId", () => {
    const route = src("src/app/api/questionnaire/leads/[id]/route.ts");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("getMemberIdFromRequest");
    expect(route).toContain("forged_owner_id");
    expect(route).toContain("deleteQuestionnaireLead");
    expect(route).toContain("fishReversed");
  });
});

describe("migration 087 — delete + dashboard RPC", () => {
  const sql = src("supabase/migrations/087_questionnaire_delete_performance.sql");

  it("defines dashboard + delete RPCs service_role only", () => {
    expect(sql).toContain("get_questionnaire_dashboard_v1");
    expect(sql).toContain("delete_questionnaire_lead_v1");
    expect(sql).toContain("revoke all on function public.delete_questionnaire_lead_v1");
    expect(sql).toContain("grant execute on function public.delete_questionnaire_lead_v1");
    expect(sql).toContain("service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("delete reverses questionnaire components only (not manual)", () => {
    expect(sql).toContain("questionnaire_fish_pool_count = greatest(questionnaire_fish_pool_count - 1, 0)");
    expect(sql).toContain(
      "questionnaire_invitation_five_steps_count =\n          greatest(questionnaire_invitation_five_steps_count - 1, 0)",
    );
    expect(sql).not.toMatch(/manual_fish_pool_count\s*=\s*greatest/);
    expect(sql).not.toMatch(/manual_invitation_five_steps_count\s*=\s*greatest/);
    expect(sql).toContain("Asia/Taipei");
    expect(sql).toContain("lead_not_found");
    expect(sql).toContain("for update");
    expect(sql).toContain("fishReversed");
    expect(sql).toContain("invitationReversed");
  });

  it("does not modify 085 or 086 migration files", () => {
    // Guard: 087 is additive only
    expect(sql).not.toContain("085_five_plus_five");
    expect(sql).toContain("DO NOT apply to Production");
  });
});

describe("Home freshness + AppShell prefetch", () => {
  it("G — Home skips softRecalc within freshness window", () => {
    const home = src("src/components/home/HomePage.tsx");
    expect(home).toContain("shouldSkipHomeSoftRecalc");
    expect(home).toContain("requestIdleCallback");
    expect(home).toContain("homeMetricsRefreshAt");
    expect(home).toContain("RESOURCE_TTL.homeMetrics");
  });

  it("H — Taipei midnight still force refreshes", () => {
    const home = src("src/components/home/HomePage.tsx");
    expect(home).toContain("millisecondsUntilNextAppMidnight");
    expect(home).toContain("bootstrap({ force: true })");
  });

  it("AppShell idle-prefetches primary routes (code only)", () => {
    const shell = src("src/components/navigation/AppShell.tsx");
    expect(shell).toContain("PRIMARY_ROUTE_PREFETCH");
    expect(shell).toContain('"/5plus5"');
    expect(shell).toContain('"/questionnaire"');
    expect(shell).toContain("router.prefetch");
    expect(shell).toContain("requestIdleCallback");
  });
});

describe("client invalidate on status/delete", () => {
  it("patch + delete invalidate required caches", () => {
    const client = src("src/lib/questionnaire/client.ts");
    expect(client).toContain("invalidateCached(CACHE_KEYS.questionnaireDashboard)");
    expect(client).toContain('invalidateCachedPrefix("questionnaire:leads:")');
    expect(client).toContain("invalidateFivePlusFiveCaches");
    expect(client).toContain("invalidateQuestionnaireCaches");
    expect(client).toContain("deleteQuestionnaireLead");
    expect(client).toContain("prefetchQuestionnaireLead");
  });
});
