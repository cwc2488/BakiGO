import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSuperAdmin,
  resolveIsSuperAdmin,
  SUPER_ADMIN_MEMBER_NUMBERS,
} from "@/lib/auth/super-admin";
import { isPublicPath } from "@/lib/auth/public-paths";
import {
  decideRecognitionAdminAccess,
  isRecognitionAdminApiPath,
  isRecognitionAdminPagePath,
} from "@/lib/recognition/recognition-access";
import { buildPointsLeaderboard } from "@/lib/points/build-points-leaderboard";
import { loadMemberMetrics } from "@/lib/mission-control/format";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/service-client", () => ({
  isSupabaseServiceConfigured: () => true,
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

class MemoryStorage implements StorageAdapter {
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

function cloudMember(id: string, memberNumber: string, name: string): Member {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organizationId: "org-default",
    herbalifeMemberId: memberNumber,
    displayName: name,
    nickname: name,
    joinedAt: "2026-01-01",
    status: "active",
    tags: [],
    rankKey: "new_member",
    roleKey: "member",
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

const ROOT = process.cwd();

describe("BakiGO Super Admin authorization", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("keeps 20699471 as the only Super Admin member number in one module", () => {
    expect([...SUPER_ADMIN_MEMBER_NUMBERS]).toEqual(["20699471"]);
    const source = readFileSync(resolve(ROOT, "src/lib/auth/super-admin.ts"), "utf8");
    expect(source).toContain('"20699471"');

    const scattered = [
      "src/app/recognition/(admin)/layout.tsx",
      "src/app/api/recognition/admin/me/route.ts",
      "src/app/api/recognition/events/route.ts",
      "src/components/home/HomePage.tsx",
      "src/components/recognition/RecognitionAdminGuard.tsx",
      "src/components/leaderboard/LeaderboardPage.tsx",
      "src/lib/recognition/recognition-service.ts",
    ];
    for (const rel of scattered) {
      const file = readFileSync(resolve(ROOT, rel), "utf8");
      expect(file, rel).not.toContain("20699471");
    }
  });

  it("20699471 → admin access allowed", () => {
    expect(isSuperAdmin("20699471")).toBe(true);
    expect(isSuperAdmin(" 20699471 ")).toBe(true);
    expect(
      decideRecognitionAdminAccess({ memberId: "20699471", isAdmin: isSuperAdmin("20699471") }),
    ).toBe("allowed");
  });

  it("other member → admin access denied", () => {
    expect(isSuperAdmin("partner-1")).toBe(false);
    expect(isSuperAdmin("00000")).toBe(false);
    expect(
      decideRecognitionAdminAccess({ memberId: "partner-1", isAdmin: false }),
    ).toBe("forbidden");
  });

  it("unauthenticated → admin access denied", () => {
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
    expect(decideRecognitionAdminAccess({ memberId: null, isAdmin: false })).toBe("unauthenticated");
    expect(isPublicPath("/recognition")).toBe(false);
    expect(isPublicPath("/recognition/events/new")).toBe(false);
  });

  it("other member direct admin URL → denied", () => {
    expect(isRecognitionAdminPagePath("/recognition")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/events/new")).toBe(true);
    expect(isRecognitionAdminPagePath("/recognition/events/evt-1/review")).toBe(true);
    expect(
      decideRecognitionAdminAccess({ memberId: "partner-1", isAdmin: isSuperAdmin("partner-1") }),
    ).toBe("forbidden");
  });

  it("other member privileged endpoint/action → denied", async () => {
    maybeSingle.mockResolvedValue({ data: { member_number: "11111111" }, error: null });
    await expect(resolveIsSuperAdmin("partner-uuid-1")).resolves.toBe(false);
    expect(isRecognitionAdminApiPath("/api/recognition/events")).toBe(true);
    expect(isRecognitionAdminApiPath("/api/recognition/events/evt-1/presentation")).toBe(true);
    expect(
      decideRecognitionAdminAccess({
        memberId: "partner-uuid-1",
        isAdmin: await resolveIsSuperAdmin("partner-uuid-1"),
      }),
    ).toBe("forbidden");
  });

  it("resolves Super Admin from members.id → member_number", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { member_number: "20699471" }, error: null });
    await expect(resolveIsSuperAdmin("uuid-of-super-admin")).resolves.toBe(true);
  });
});

describe("Super Admin does not change /leaderboard", () => {
  it("does not treat /leaderboard as an admin route", () => {
    expect(isRecognitionAdminPagePath("/leaderboard")).toBe(false);
    expect(isRecognitionAdminApiPath("/api/leaderboard")).toBe(false);
    expect(isPublicPath("/leaderboard")).toBe(false);
    const page = readFileSync(resolve(ROOT, "src/components/leaderboard/LeaderboardPage.tsx"), "utf8");
    expect(page).not.toContain("isRecognitionAdmin");
    expect(page).not.toContain("assertRecognitionAdmin");
    expect(page).not.toContain("resolveIsSuperAdmin");
    expect(page).not.toContain("20699471");
  });

  it("20699471 → /leaderboard scoring works", () => {
    const admin = cloudMember("admin-uuid", "20699471", "Super Admin");
    const partner = cloudMember("partner-uuid", "11111111", "一般夥伴");
    const metricsByMemberId = new Map<string, MemberComputedMetrics>([
      [
        admin.id,
        {
          gamification: {
            points: {
              memberId: admin.id,
              lifetimePoints: 12,
              monthlyPoints: 12,
              weeklyPoints: 4,
              todayPoints: 0,
              redeemedPoints: 0,
              availablePoints: 12,
              streakMultiplier: 1,
            },
            streak: {
              memberId: admin.id,
              currentStreak: 3,
              longestStreak: 3,
              lastActiveDate: "2026-08-18",
              isActiveToday: true,
            },
          },
        } as MemberComputedMetrics,
      ],
      [
        partner.id,
        {
          gamification: {
            points: {
              memberId: partner.id,
              lifetimePoints: 8,
              monthlyPoints: 8,
              weeklyPoints: 2,
              todayPoints: 0,
              redeemedPoints: 0,
              availablePoints: 8,
              streakMultiplier: 1,
            },
            streak: {
              memberId: partner.id,
              currentStreak: 1,
              longestStreak: 1,
              lastActiveDate: "2026-08-18",
              isActiveToday: true,
            },
          },
        } as MemberComputedMetrics,
      ],
    ]);

    const monthly = buildPointsLeaderboard({
      members: [admin, partner],
      metricsByMemberId,
      yearMonth: "2026-08",
      referenceDate: "2026-08-18",
      viewerMemberId: admin.id,
      period: "monthly",
    });
    expect(monthly.viewerEntry?.memberId).toBe(admin.id);
    expect(monthly.viewerEntry?.monthlyPoints).toBe(12);
    expect(monthly.entries).toHaveLength(2);
  });

  it("一般 member → /leaderboard scoring works", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.cloudMembersMode, "1");
    storage.setItem(
      STORAGE_KEYS.members,
      JSON.stringify([cloudMember("partner-uuid", "11111111", "一般夥伴")]),
    );
    const metrics = loadMemberMetrics("partner-uuid", storage, undefined, {
      includeMapUniverse: false,
    });
    expect(metrics.gamification.streak.currentStreak).toBeGreaterThanOrEqual(0);
    expect(metrics.gamification.points.availablePoints).toBeGreaterThanOrEqual(0);

    const monthly = buildPointsLeaderboard({
      members: [cloudMember("partner-uuid", "11111111", "一般夥伴")],
      metricsByMemberId: new Map([["partner-uuid", metrics]]),
      yearMonth: "2026-08",
      referenceDate: "2026-08-18",
      viewerMemberId: "partner-uuid",
      period: "monthly",
    });
    expect(monthly.viewerEntry?.memberId).toBe("partner-uuid");
  });
});

describe("privileged Recognition routes stay on the Super Admin resolver", () => {
  it("admin APIs still independently call assertRecognitionAdmin / isRecognitionAdmin", () => {
    const apiDir = resolve(ROOT, "src/app/api/recognition");
    const routeFiles = listFiles(apiDir).filter((file) => file.endsWith("route.ts"));
    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      const rel = relative(ROOT, file);
      if (rel.includes("/public/")) {
        expect(source, rel).not.toContain("assertRecognitionAdmin");
        continue;
      }
      expect(source, rel).toContain("getMemberIdFromRequest");
      if (rel.endsWith("admin/me/route.ts")) {
        expect(source, rel).toContain("isRecognitionAdmin");
        continue;
      }
      expect(source, rel).toContain("assertRecognitionAdmin");
    }

    const service = readFileSync(resolve(ROOT, "src/lib/recognition/recognition-service.ts"), "utf8");
    expect(service).toContain("resolveIsSuperAdmin");
    expect(service).not.toContain(".from(\"recognition_admin_members\")");
  });
});
