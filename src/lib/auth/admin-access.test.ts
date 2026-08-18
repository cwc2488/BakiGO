import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ADMIN_AUTHORITY,
  ADMIN_CENTER_EXISTING_TOOLS,
  ADMIN_CENTER_HOME_ENTRY,
  decideAdminAccess,
  homeMoreEntriesForViewer,
  isAdminCenterApiPath,
  isAdminCenterPagePath,
  RECOGNITION_CENTER_ENTRY,
} from "@/lib/auth/admin-access";
import { isPublicPath } from "@/lib/auth/public-paths";
import { MY_HOME_MORE_ENTRIES } from "@/lib/home/my-home-presentation";
import { SUPER_ADMIN_MEMBER_NUMBERS } from "@/lib/auth/super-admin";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const ROOT = process.cwd();

describe("Admin Center Super Admin authorization", () => {
  it("uses the same Super Admin source as Recognition Center", () => {
    expect(ADMIN_AUTHORITY.source).toBe("src/lib/auth/super-admin.ts");
    expect(ADMIN_AUTHORITY.memberNumbers).toBe("SUPER_ADMIN_MEMBER_NUMBERS");
    expect([...SUPER_ADMIN_MEMBER_NUMBERS]).toEqual(["20699471"]);
  });

  it("does not scatter 20699471 into Admin Center UI or routes", () => {
    const files = [
      "src/app/admin/layout.tsx",
      "src/app/admin/page.tsx",
      "src/app/api/admin/me/route.ts",
      "src/components/admin/AdminCenterPage.tsx",
      "src/components/admin/SuperAdminGuard.tsx",
      "src/lib/auth/admin-access.ts",
      "src/lib/auth/use-super-admin.ts",
    ];
    for (const rel of files) {
      expect(readFileSync(resolve(ROOT, rel), "utf8"), rel).not.toContain("20699471");
    }
  });

  it("treats /admin as Super Admin-only", () => {
    expect(isAdminCenterPagePath("/admin")).toBe(true);
    expect(isAdminCenterPagePath("/admin/")).toBe(true);
    expect(isAdminCenterApiPath("/api/admin/me")).toBe(true);
    expect(isPublicPath("/admin")).toBe(false);
    expect(isAdminCenterPagePath("/leaderboard")).toBe(false);
    expect(isAdminCenterPagePath("/recognition")).toBe(false);
  });

  it("A. Super Admin can see Admin Center; partners cannot", () => {
    expect(decideAdminAccess({ memberId: "admin-1", isAdmin: true })).toBe("allowed");
    expect(decideAdminAccess({ memberId: "partner-1", isAdmin: false })).toBe("forbidden");
    expect(decideAdminAccess({ memberId: null, isAdmin: false })).toBe("unauthenticated");

    const partner = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, false);
    expect(partner.some((entry) => entry.href === "/admin")).toBe(false);
    expect(partner.some((entry) => entry.title === "管理中心")).toBe(false);
    expect(partner.some((entry) => entry.href === "/recognition")).toBe(false);

    const admin = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, true);
    expect(admin).toContainEqual(ADMIN_CENTER_HOME_ENTRY);
    expect(admin.filter((entry) => entry.href === "/admin")).toHaveLength(1);
    expect(admin.some((entry) => entry.href === "/recognition")).toBe(false);
  });

  it("nests Recognition Center under Admin Center instead of replacing it", () => {
    expect(RECOGNITION_CENTER_ENTRY.href).toBe("/recognition");
    expect(ADMIN_CENTER_HOME_ENTRY.href).toBe("/admin");
    const page = readFileSync(resolve(ROOT, "src/components/admin/AdminCenterPage.tsx"), "utf8");
    expect(page).toContain("表揚中心");
    expect(page).toContain("/recognition");
    for (const tool of ADMIN_CENTER_EXISTING_TOOLS) {
      expect(page).toContain(tool.href);
      expect(page).toContain(tool.title);
    }
  });

  it("gates Admin Center pages with server layout + SuperAdminGuard", () => {
    const layout = readFileSync(resolve(ROOT, "src/app/admin/layout.tsx"), "utf8");
    expect(layout).toContain("resolveIsSuperAdmin");
    expect(layout).toContain("notFound");
    expect(layout).toContain("SuperAdminGuard");
    expect(layout).not.toContain("20699471");
  });

  it("requires Super Admin on /api/admin/me", () => {
    const source = readFileSync(resolve(ROOT, "src/app/api/admin/me/route.ts"), "utf8");
    expect(source).toContain("getMemberIdFromRequest");
    expect(source).toContain("resolveIsSuperAdmin");
  });
});

describe("Admin Center does not swallow partner features", () => {
  it("does not put /leaderboard behind Super Admin", () => {
    expect(isAdminCenterPagePath("/leaderboard")).toBe(false);
    const page = readFileSync(resolve(ROOT, "src/components/leaderboard/LeaderboardPage.tsx"), "utf8");
    expect(page).not.toContain("resolveIsSuperAdmin");
    expect(page).not.toContain("isRecognitionAdmin");
    expect(page).not.toContain("20699471");
  });

  it("keeps existing org tools at their original partner-accessible routes", () => {
    expect(ADMIN_CENTER_EXISTING_TOOLS.map((tool) => tool.href)).toEqual([
      "/organization",
      "/members",
      "/profile",
    ]);
    const adminPages = listFiles(resolve(ROOT, "src/app/admin")).filter((file) => file.endsWith("page.tsx"));
    expect(adminPages).toHaveLength(1);
  });
});
