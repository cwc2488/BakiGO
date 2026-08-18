import { describe, expect, it } from "vitest";
import { calculatePoints } from "@/lib/business-engine/achievement/calculate-points";
import { calculateStreak } from "@/lib/business-engine/achievement/calculate-streak";
import { collectGamificationEvents } from "@/lib/business-engine/achievement/collect-events";
import { GAMIFICATION_EVENT_SOURCES } from "@/lib/business-engine/rules/gamification";
import { ACTIVITY_KEYS } from "@/lib/business-engine/rules/keys";
import type { GamificationEvent } from "@/types/gamification";

function event(overrides: Partial<GamificationEvent> & Pick<GamificationEvent, "id" | "eventDate">): GamificationEvent {
  return {
    memberId: "member-1",
    eventSource: GAMIFICATION_EVENT_SOURCES.MEASUREMENT,
    eventKey: ACTIVITY_KEYS.MEASUREMENT,
    value: 1,
    createdAt: overrides.eventDate,
    ...overrides,
  };
}

describe("leaderboard points/streak production data compatibility", () => {
  it("skips events with missing dates instead of crashing", () => {
    const events = [
      event({ id: "ok", eventDate: "2026-08-18" }),
      event({
        id: "broken",
        eventDate: undefined as unknown as string,
      }),
    ];

    const points = calculatePoints({
      memberId: "member-1",
      referenceDate: "2026-08-18",
      yearMonth: "2026-08",
      events,
    });
    const streak = calculateStreak("member-1", events, "2026-08-18");

    expect(points.monthlyPoints).toBeGreaterThan(0);
    expect(points.weeklyPoints).toBeGreaterThan(0);
    expect(points.availablePoints).toBe(points.lifetimePoints);
    expect(streak.currentStreak).toBeGreaterThanOrEqual(1);
    expect(streak.isActiveToday).toBe(true);
  });

  it("sorts mixed dated/undated gamification events without throwing", () => {
    expect(() =>
      collectGamificationEvents({
        memberId: "member-1",
        activities: [
          {
            id: "a1",
            memberId: "member-1",
            activityKey: ACTIVITY_KEYS.MEASUREMENT,
            activityDate: "2026-08-18",
          },
          {
            id: "a2",
            memberId: "member-1",
            activityKey: ACTIVITY_KEYS.MEASUREMENT,
            activityDate: undefined as unknown as string,
          },
        ],
        transactions: [],
      }),
    ).not.toThrow();
  });
});
