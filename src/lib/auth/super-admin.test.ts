import { describe, expect, it, vi } from "vitest";
import {
  isSuperAdmin,
  SUPER_ADMIN_MEMBER_NUMBERS,
} from "@/lib/auth/super-admin";
import {
  decideAdminAccess,
  homeMoreEntriesForViewer,
  ADMIN_CENTER_HOME_ENTRY,
} from "@/lib/auth/admin-access";
import {
  decideRecognitionAdminAccess,
  isRecognitionAdminApiPath,
  isRecognitionAdminPagePath,
} from "@/lib/recognition/recognition-access";
import { isPublicPath } from "@/lib/auth/public-paths";

vi.mock("@/lib/supabase/service-client", () => ({
  isSupabaseServiceConfigured: () => true,
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

describe("Super Admin / 表揚中心 permissions", () => {
  it("keeps the configured Super Admin member numbers", () => {
    expect(SUPER_ADMIN_MEMBER_NUMBERS).toContain("20699471");
    expect(isSuperAdmin("20699471")).toBe(true);
    expect(isSuperAdmin("11111111")).toBe(false);
  });

  it("admin center entry is only injected for Super Admin", () => {
    const base = [
      { href: "/leaderboard", title: "排行榜" },
      { href: "/profile", title: "個人資料" },
    ];
    expect(homeMoreEntriesForViewer(base, true).some((e) => e.href === ADMIN_CENTER_HOME_ENTRY.href)).toBe(
      true,
    );
    expect(homeMoreEntriesForViewer(base, false).some((e) => e.href === ADMIN_CENTER_HOME_ENTRY.href)).toBe(
      false,
    );
  });

  it("admin / recognition page access stays Super Admin gated", () => {
    expect(decideAdminAccess({ memberId: "m1", isAdmin: true })).toBe("allowed");
    expect(decideAdminAccess({ memberId: "m1", isAdmin: false })).toBe("forbidden");
    expect(decideRecognitionAdminAccess({ memberId: "m1", isAdmin: true })).toBe("allowed");
    expect(decideRecognitionAdminAccess({ memberId: "m1", isAdmin: false })).toBe("forbidden");
    expect(isRecognitionAdminPagePath("/recognition")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events")).toBe(true);
    expect(isRecognitionAdminPagePath("/leaderboard")).toBe(false);
  });

  it("public recognition collection stays public; admin recognition stays private", () => {
    expect(isPublicPath("/recognition/p/demo-token")).toBe(true);
    expect(isPublicPath("/recognition")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
  });
});
