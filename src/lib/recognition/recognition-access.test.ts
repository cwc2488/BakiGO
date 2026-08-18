import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  ADMIN_CENTER_HOME_ENTRY,
  decideRecognitionAdminAccess,
  homeMoreEntriesForViewer,
  isRecognitionAdminApiPath,
  isRecognitionAdminPagePath,
  isRecognitionPublicApiPath,
  isRecognitionPublicCollectionPath,
  RECOGNITION_ADMIN_AUTHORITY,
} from "@/lib/recognition/recognition-access";
import { MY_HOME_MORE_ENTRIES } from "@/lib/home/my-home-presentation";
import { isPublicPath } from "@/lib/auth/public-paths";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const ROOT = process.cwd();
const API_DIR = resolve(ROOT, "src/app/api/recognition");
const PAGE_DIR = resolve(ROOT, "src/app/recognition");

describe("Recognition Center canonical admin authority", () => {
  it("uses Super Admin (src/lib/auth/super-admin.ts) rather than rank or a second admin system", () => {
    expect(RECOGNITION_ADMIN_AUTHORITY.source).toBe("src/lib/auth/super-admin.ts");
    expect(RECOGNITION_ADMIN_AUTHORITY.memberNumbers).toBe("SUPER_ADMIN_MEMBER_NUMBERS");
    const source = readFileSync(resolve(ROOT, "src/lib/recognition/recognition-service.ts"), "utf8");
    expect(source).toContain("resolveIsSuperAdmin");
    expect(source).not.toContain('.from("recognition_admin_members")');
    expect(source).not.toMatch(/current_level/);
    expect(source).not.toMatch(/role === ["']president["']/);
    expect(source).not.toContain("20699471");
  });
});

describe("Recognition Center authorization decisions", () => {
  it("A. denies unauthenticated users", () => {
    expect(decideRecognitionAdminAccess({ memberId: null, isAdmin: false })).toBe("unauthenticated");
    expect(isPublicPath("/recognition")).toBe(false);
    expect(isPublicPath("/recognition/events/evt-1")).toBe(false);
    expect(isPublicPath("/recognition/events/evt-1/review")).toBe(false);
    expect(isPublicPath("/api/recognition/events")).toBe(false);
  });

  it("B/H. denies a normal authenticated partner on admin pages, including direct URLs", () => {
    expect(decideRecognitionAdminAccess({ memberId: "partner-1", isAdmin: false })).toBe("forbidden");
    expect(isRecognitionAdminPagePath("/recognition")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/events/new")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/events/evt-1")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/events/evt-1/review")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/events/evt-1/photos")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/events/evt-1/exceptions")).toBe(true);
  });

  it("C/D/E/I. classifies admin API paths as protected, including PPT generation", () => {
    expect(isRecognitionAdminApiPath("/api/recognition/catalog")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1/candidates")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1/presentation")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1/ppt-readiness")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1/roster")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1/exceptions")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1/dashboard")).toBe(true);
    expect(isRecognitionPublicApiPath("/api/recognition/public/token")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/public/token")).toBe(false);
  });

  it("F/G. allows Recognition Admin", () => {
    expect(decideRecognitionAdminAccess({ memberId: "admin-1", isAdmin: true })).toBe("allowed");
  });

  it("keeps public collection reachable without Recognition Admin", () => {
    expect(isRecognitionPublicCollectionPath("/recognition/p/token-abc")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/p/token-abc")).toBe(false);
    expect(isPublicPath("/recognition/p/token-abc")).toBe(true);
  });
});

describe("Recognition Center navigation visibility", () => {
  it("hides 管理中心 and 表揚中心 from partners", () => {
    const partner = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, false);
    expect(partner.some((entry) => entry.href === "/admin")).toBe(false);
    expect(partner.some((entry) => entry.href === "/recognition")).toBe(false);
    expect(partner.some((entry) => entry.title === "表揚中心")).toBe(false);
    expect(partner.some((entry) => entry.title === "管理中心")).toBe(false);
    expect(partner.some((entry) => /admin only|管理員/i.test(entry.title))).toBe(false);
    expect(MY_HOME_MORE_ENTRIES.some((entry) => entry.href === "/recognition")).toBe(false);
    expect(MY_HOME_MORE_ENTRIES.some((entry) => entry.href === "/admin")).toBe(false);
  });

  it("shows 管理中心 only for Super Admin, with Recognition nested inside it", () => {
    const admin = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, true);
    expect(admin).toContainEqual(ADMIN_CENTER_HOME_ENTRY);
    expect(admin.filter((entry) => entry.href === "/admin")).toHaveLength(1);
    expect(admin.some((entry) => entry.href === "/recognition")).toBe(false);
  });
});

describe("Recognition Center server/API enforcement", () => {
  it("requires Bearer member id + assertRecognitionAdmin on every admin API route", () => {
    const routeFiles = listFiles(API_DIR).filter((file) => file.endsWith("route.ts"));
    expect(routeFiles.length).toBeGreaterThan(10);
    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      const rel = relative(ROOT, file);
      if (rel.includes("/public/")) {
        expect(source, rel).not.toContain("assertRecognitionAdmin");
        continue;
      }
      expect(source, rel).toContain("getMemberIdFromRequest");
      if (rel.endsWith("admin/me/route.ts")) {
        expect(source, rel).toContain("resolveIsSuperAdmin");
        continue;
      }
      expect(source, rel).toContain("assertRecognitionAdmin");
    }
  });

  it("protects PPT generation and retrieval on the admin-authenticated server path", () => {
    const source = readFileSync(
      resolve(ROOT, "src/app/api/recognition/events/[eventId]/presentation/route.ts"),
      "utf8",
    );
    expect(source).toContain("export async function GET");
    expect(source).toContain("export async function POST");
    expect(source.match(/assertRecognitionAdmin/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("Cache-Control");
    expect(source).toContain("private, no-store");
  });

  it("gates admin pages with a server layout that is not used by public collection", () => {
    const layout = readFileSync(resolve(ROOT, "src/app/recognition/(admin)/layout.tsx"), "utf8");
    expect(layout).toContain("getMemberIdFromCookies");
    expect(layout).toContain("member-auth-server");
    expect(layout).toContain("isRecognitionAdmin");
    expect(layout).toContain("notFound");
    expect(layout).toContain("RecognitionAdminGuard");
    expect(layout).not.toContain("admin only");
    expect(layout).not.toContain("Recognition Admin 授權");

    const publicPage = readFileSync(resolve(ROOT, "src/app/recognition/p/[token]/page.tsx"), "utf8");
    expect(publicPage).not.toContain("RecognitionAdminGuard");
    expect(publicPage).not.toContain("assertRecognitionAdmin");

    const adminPages = listFiles(join(PAGE_DIR, "(admin)")).filter((file) => file.endsWith("page.tsx"));
    expect(adminPages.length).toBeGreaterThanOrEqual(5);
  });

  it("does not reveal Recognition Admin copy in the client guard", () => {
    const guard = readFileSync(resolve(ROOT, "src/components/recognition/RecognitionAdminGuard.tsx"), "utf8");
    const shared = readFileSync(resolve(ROOT, "src/components/admin/SuperAdminGuard.tsx"), "utf8");
    expect(guard).toContain("SuperAdminGuard");
    expect(shared).toContain("notFound");
    expect(guard).not.toContain("權限不足");
    expect(guard).not.toContain("Recognition Admin 授權");
    expect(guard).not.toContain("admin only");
    expect(shared).not.toContain("20699471");
  });
});
