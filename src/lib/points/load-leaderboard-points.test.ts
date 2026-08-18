import { beforeEach, describe, expect, it } from "vitest";
import { scoreMemberLeaderboardPoints, buildLeaderboardBoards } from "@/lib/points/load-leaderboard-points";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";
import type { BakiEvent } from "@/types/baki-event";
import { ACTIVITY_KEYS, RANK_KEYS } from "@/lib/business-engine/rules/keys";

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

function member(overrides: Partial<Member> & Pick<Member, "id">): Member {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organizationId: "org-default",
    herbalifeMemberId: overrides.herbalifeMemberId ?? `HL-${overrides.id}`,
    displayName: overrides.displayName ?? "夥伴",
    joinedAt: "2026-01-01",
    status: "active",
    tags: [],
    rankKey: RANK_KEYS.NEW_MEMBER,
    roleKey: "member",
    ...overrides,
  };
}

function event(overrides: Partial<BakiEvent> & Pick<BakiEvent, "id" | "memberId">): BakiEvent {
  return {
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    organizationId: "org-default",
    eventTypeKey: ACTIVITY_KEYS.MEASUREMENT,
    eventCategory: "activity",
    eventDate: "2026-08-18",
    value: 1,
    ...overrides,
  };
}

describe("leaderboard points-only scoring", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("scores real measurement points and ignores invalid cloud events", () => {
    const snapshot = scoreMemberLeaderboardPoints({
      memberId: "partner-1",
      referenceDate: "2026-08-18",
      yearMonth: "2026-08",
      events: [
        event({ id: "ok", memberId: "partner-1", eventDate: "2026-08-18" }),
        {
          ...event({ id: "broken-date", memberId: "partner-1" }),
          eventDate: undefined as unknown as string,
        },
        { ...event({ id: "missing-id", memberId: "partner-1" }), id: "" },
      ],
    });

    expect(snapshot.gamification.points.monthlyPoints).toBeGreaterThan(0);
    expect(snapshot.gamification.points.weeklyPoints).toBeGreaterThan(0);
  });

  it("does not crash for a promotion-group member with undated downline events", () => {
    const leader = member({
      id: "leader-1",
      displayName: "領導",
      rankKey: RANK_KEYS.PROMOTION_GROUP,
    });
    const partner = member({ id: "partner-1", displayName: "夥伴" });
    storage.setItem(STORAGE_KEYS.members, JSON.stringify([leader, partner]));
    storage.setItem(
      STORAGE_KEYS.bakiEvents,
      JSON.stringify([
        event({ id: "leader-ok", memberId: "leader-1", eventDate: "2026-08-17" }),
        {
          ...event({ id: "bad-downline", memberId: "partner-1" }),
          eventDate: undefined as unknown as string,
        },
      ]),
    );

    const boards = buildLeaderboardBoards({
      members: [leader, partner],
      storage,
      downlineCache: new Map([
        [
          "partner-1",
          {
            events: [
              {
                ...event({ id: "cloud-bad", memberId: "partner-1" }),
                eventDate: undefined as unknown as string,
              },
              event({ id: "cloud-ok", memberId: "partner-1", eventDate: "2026-08-18" }),
            ],
            pipelineLeads: [],
          },
        ],
      ]),
      referenceDate: "2026-08-18",
      yearMonth: "2026-08",
      viewerMemberId: "partner-1",
    });

    expect(boards.weekly.entries.length).toBeGreaterThan(0);
    expect(boards.monthly.entries.length).toBeGreaterThan(0);
    expect(boards.weekly.viewerEntry?.memberId).toBe("partner-1");
    expect(boards.monthly.viewerEntry?.periodPoints).toBeGreaterThan(0);
  });

  it("keeps Super Admin and partners on the same scoring path", () => {
    const admin = member({
      id: "admin-uuid",
      herbalifeMemberId: "20699471",
      displayName: "Super Admin",
    });
    const partner = member({ id: "partner-uuid", herbalifeMemberId: "11111111" });
    storage.setItem(STORAGE_KEYS.members, JSON.stringify([admin, partner]));
    storage.setItem(
      STORAGE_KEYS.bakiEvents,
      JSON.stringify([
        event({ id: "a1", memberId: admin.id, eventDate: "2026-08-18" }),
        event({ id: "p1", memberId: partner.id, eventDate: "2026-08-18" }),
      ]),
    );

    const boards = buildLeaderboardBoards({
      members: [admin, partner],
      storage,
      referenceDate: "2026-08-18",
      yearMonth: "2026-08",
      viewerMemberId: partner.id,
    });

    expect(boards.weekly.entries.map((entry) => entry.memberId).sort()).toEqual(
      ["admin-uuid", "partner-uuid"].sort(),
    );
  });
});
