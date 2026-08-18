import { describe, expect, it } from "vitest";
import { buildPointsLeaderboard } from "@/lib/points/build-points-leaderboard";
import type { LeaderboardPointsSnapshot } from "@/lib/points/build-points-leaderboard";
import type { Member } from "@/types/member";

function member(overrides: Partial<Member> & Pick<Member, "id">): Member {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organizationId: "org-default",
    herbalifeMemberId: overrides.herbalifeMemberId ?? `HL-${overrides.id}`,
    displayName: "夥伴",
    joinedAt: "2026-01-01",
    status: "active",
    tags: [],
    rankKey: "new_member",
    roleKey: "member",
    ...overrides,
  };
}

function metrics(
  memberId: string,
  monthlyPoints: number,
  weeklyPoints: number,
): LeaderboardPointsSnapshot {
  void memberId;
  return {
    gamification: {
      points: {
        monthlyPoints,
        weeklyPoints,
        lifetimePoints: monthlyPoints,
        availablePoints: monthlyPoints,
        streakMultiplier: 1,
      },
      streak: {
        currentStreak: 2,
      },
    },
  };
}

describe("buildPointsLeaderboard", () => {
  it("does not crash when a production member is missing displayName and nickname", () => {
    const nameless = member({
      id: "member-cloud-1",
      displayName: undefined as unknown as string,
      nickname: undefined,
    });
    const named = member({ id: "member-cloud-2", displayName: "小美", nickname: "美美" });
    const metricsByMemberId = new Map([
      [nameless.id, metrics(nameless.id, 10, 3)],
      [named.id, metrics(named.id, 20, 8)],
    ]);

    const monthly = buildPointsLeaderboard({
      members: [nameless, named],
      metricsByMemberId,
      yearMonth: "2026-08",
      referenceDate: "2026-08-18",
      viewerMemberId: nameless.id,
      period: "monthly",
    });

    expect(monthly.entries).toHaveLength(2);
    expect(monthly.entries[0]?.memberId).toBe(named.id);
    expect(monthly.entries[0]?.rank).toBe(1);
    expect(monthly.viewerEntry?.memberId).toBe(nameless.id);
    expect(monthly.viewerEntry?.rank).toBe(2);
    expect(monthly.viewerEntry?.monthlyPoints).toBe(10);
    expect(monthly.viewerEntry?.availablePoints).toBe(10);
  });

  it("keeps weekly ranking independent of monthly points", () => {
    const a = member({ id: "a", displayName: "A" });
    const b = member({ id: "b", displayName: "B" });
    const metricsByMemberId = new Map([
      [a.id, metrics(a.id, 100, 1)],
      [b.id, metrics(b.id, 10, 9)],
    ]);

    const weekly = buildPointsLeaderboard({
      members: [a, b],
      metricsByMemberId,
      yearMonth: "2026-08",
      referenceDate: "2026-08-18",
      viewerMemberId: a.id,
      period: "weekly",
    });

    expect(weekly.entries[0]?.memberId).toBe(b.id);
    expect(weekly.viewerEntry?.weeklyPoints).toBe(1);
  });

  it("tolerates missing gamification metrics without changing rank order of scored members", () => {
    const a = member({ id: "a", displayName: "A" });
    const b = member({ id: "b", displayName: "B" });
    const result = buildPointsLeaderboard({
      members: [a, b],
      metricsByMemberId: new Map([[a.id, metrics(a.id, 15, 4)]]),
      yearMonth: "2026-08",
      referenceDate: "2026-08-18",
      viewerMemberId: b.id,
      period: "monthly",
    });

    expect(result.entries[0]?.memberId).toBe(a.id);
    expect(result.viewerEntry?.monthlyPoints).toBe(0);
    expect(result.viewerEntry?.currentStreak).toBe(0);
  });
});
