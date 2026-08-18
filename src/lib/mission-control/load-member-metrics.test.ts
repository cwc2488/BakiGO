import { describe, expect, it } from "vitest";
import { loadMemberMetrics } from "@/lib/mission-control/format";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";

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

function cloudMember(id: string, name?: string): Member {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organizationId: "org-default",
    herbalifeMemberId: `HL-${id}`,
    displayName: name as string,
    nickname: name,
    email: `${id}@example.com`,
    joinedAt: "2026-01-01",
    status: "active",
    tags: [],
    rankKey: "new_member",
    roleKey: "member",
  };
}

describe("loadMemberMetrics leaderboard path", () => {
  it("computes points for cloud members with incomplete events without throwing", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.cloudMembersMode, "1");
    storage.setItem(
      STORAGE_KEYS.members,
      JSON.stringify([
        cloudMember("viewer-1", "我"),
        cloudMember("partner-1"),
      ]),
    );
    storage.setItem(
      STORAGE_KEYS.bakiEvents,
      JSON.stringify([
        null,
        {
          id: "evt-ok",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
          organizationId: "org-default",
          memberId: "partner-1",
          eventTypeKey: "measurement",
          eventCategory: "activity",
          eventDate: "2026-08-18",
        },
        {
          id: "evt-broken",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
          organizationId: "org-default",
          memberId: "partner-1",
          eventTypeKey: "measurement",
          eventCategory: "activity",
        },
      ]),
    );

    const partner = loadMemberMetrics("partner-1", storage, undefined, {
      includeMapUniverse: false,
    });
    const viewer = loadMemberMetrics("viewer-1", storage, undefined, {
      includeMapUniverse: false,
    });

    expect(partner.gamification.streak.currentStreak).toBeGreaterThanOrEqual(0);
    expect(partner.gamification.points.monthlyPoints).toBeGreaterThan(0);
    expect(viewer.gamification.streak.currentStreak).toBeGreaterThanOrEqual(0);
    expect(viewer.gamification.points.availablePoints).toBeGreaterThanOrEqual(0);
  });
});
