import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(`${root}/${rel}`, "utf8");
}

describe("baki-life-01 source gates", () => {
  it("life layout uses Super Admin gate", () => {
    const layout = read("src/app/life/layout.tsx");
    expect(layout).toContain("resolveIsSuperAdmin");
    expect(layout).toContain("SuperAdminGuard");
    expect(layout).toContain("decideAdminAccess");
  });

  it("life APIs require owner assert", () => {
    const api = read("src/lib/life/api.ts");
    expect(api).toContain("assertSuperAdmin");
    expect(api).toContain("getMemberIdFromRequest");
  });

  it("does not hardcode super admin member number outside super-admin.ts", () => {
    const lifeService = read("src/lib/life/life-service.ts");
    expect(lifeService).not.toContain("20699471");
  });

  it("AppShell excludes life routes from Baki Go nav/schedulers", () => {
    const shell = read("src/components/navigation/AppShell.tsx");
    expect(shell).toContain('pathname === "/life"');
    expect(shell).toContain("lifeSurface");
  });

  it("migration is service-role only", () => {
    const sql = read("supabase/migrations/076_baki_life_v1.sql");
    expect(sql).toContain("life_accounts");
    expect(sql).toContain("revoke all on table public.life_transactions from anon, authenticated");
    expect(sql).toContain("grant all on table public.life_accounts to service_role");
  });

  it("scoped life PWA manifest exists", () => {
    const manifest = read("public/life/manifest.webmanifest");
    expect(manifest).toContain('"name": "Baki Life"');
    expect(manifest).toContain('"start_url": "/life/quick"');
    expect(manifest).toContain('"background_color": "#f5faf6"');
    expect(manifest).toContain("/life-icons/");
  });

  it("main Baki Go manifest untouched", () => {
    const manifest = read("public/manifest.json");
    expect(manifest).toContain("Baki GO");
    expect(manifest).not.toContain("Baki Life");
  });

  it("Life shell uses persistent client tabs (no router.push for main tabs)", () => {
    const shell = read("src/components/life/LifeShell.tsx");
    expect(shell).toContain("syncLifeTabUrl");
    expect(shell).toContain("setActiveTab");
    expect(shell).toContain("shellMode");
    expect(read("src/components/life/LifeTabContext.tsx")).toContain("history.pushState");
    // Main tab bar must not drive Next App Router navigations.
    expect(shell).not.toContain("router.push(");
    expect(shell).toContain("LifeDashboardPage");
    expect(shell).toContain("LifeQuickPage");
  });

  it("life tab path helpers map main routes", () => {
    const tabs = read("src/components/life/life-tabs.ts");
    expect(tabs).toContain('href: "/life/quick"');
    expect(tabs).toContain("lifeTabFromPath");
  });

  it("life nav CSS: fixed bottom + single safe-area owner", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain(".life-bottom-nav");
    expect(css).toContain("--life-nav-offset");
    expect(css).toMatch(/\.life-bottom-nav\s*\{[\s\S]*?bottom:\s*0/);
    expect(css).toMatch(
      /\.life-bottom-nav\s*\{[\s\S]*?padding-bottom:\s*env\(safe-area-inset-bottom/,
    );
    expect(css).toMatch(/\.life-content\s*\{[\s\S]*?padding-bottom:\s*var\(--life-nav-offset\)/);
  });

  it("exposes account transfer UI and records management", () => {
    const assets = read("src/components/life/LifeAssetsPage.tsx");
    const quick = read("src/components/life/LifeQuickPage.tsx");
    const service = read("src/lib/life/life-service.ts");
    expect(assets).toContain("LifeTransferCard");
    expect(quick).toContain("LifeRecordsPanel");
    expect(service).toContain("pocket_not_empty");
    expect(service).toContain("deleteSnapshot");
  });

  it("shell gates inactive panel work and switches on pointerdown", () => {
    const shell = read("src/components/life/LifeShell.tsx");
    expect(shell).toContain("LifePanelActivityProvider");
    expect(shell).toContain("queueMicrotask");
    expect(shell).toContain("onPressStart(item.id)");
    expect(shell).toContain("onSelect(item.id)");
  });

  it("dashboard returns all in-progress goals in one response", () => {
    const service = read("src/lib/life/life-service.ts");
    const page = read("src/components/life/LifeDashboardPage.tsx");
    expect(service).toContain("goals: dashboardGoals");
    expect(service).toMatch(
      /g\.status === "active" \|\| g\.status === "planning" \|\| g\.status === "paused"/,
    );
    expect(service).toContain("listGoals(ownerMemberId)");
    expect(page).toContain('title="人生目標"');
    expect(page).toContain("data.goals");
    expect(page).toContain('lifeFetch<Dashboard>("/api/life/dashboard")');
    expect(page).not.toContain("/api/life/goals");
  });
});
