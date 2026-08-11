import { describe, expect, it } from "vitest";
import {
  buildCoachingTodayStatus,
  countPrimaryMealsDone,
  formatCoachingTodayStatusLine,
  isMealReported,
} from "@/lib/coaching/coaching-completion";
import type { CoachingMealEntryWithPhoto } from "@/types/coaching";

function meal(slot: CoachingMealEntryWithPhoto["mealSlot"], overrides?: Partial<CoachingMealEntryWithPhoto>): CoachingMealEntryWithPhoto {
  return {
    id: `${slot}-id`,
    dailyLogId: "log-1",
    mealSlot: slot,
    textNote: null,
    eatenAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    photo: null,
    ...overrides,
  };
}

describe("coaching completion", () => {
  it("counts a meal as reported when photo or text exists", () => {
    expect(isMealReported(meal("breakfast"))).toBe(false);
    expect(isMealReported(meal("breakfast", { textNote: "  " }))).toBe(false);
    expect(isMealReported(meal("breakfast", { textNote: "奶昔" }))).toBe(true);
    expect(
      isMealReported(
        meal("breakfast", {
          photo: {
            id: "photo-1",
            mealEntryId: "breakfast-id",
            storagePath: "path",
            uploadedAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        }),
      ),
    ).toBe(true);
  });

  it("builds dashboard status for partial reports", () => {
    const status = buildCoachingTodayStatus({
      enrollmentId: "enroll-1",
      customerId: "cust-1",
      customerDisplayName: "Amy",
      goal: "減脂",
      logDate: "2026-08-11",
      log: {
        id: "log-1",
        enrollmentId: "enroll-1",
        customerId: "cust-1",
        ownerMemberId: "member-1",
        logDate: "2026-08-11",
        waterMl: 1500,
        exerciseNote: null,
        bowelMovementCount: null,
        sleepDuration: null,
        customerNote: null,
        submittedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      meals: [meal("breakfast", { textNote: "奶昔" })],
    });

    expect(countPrimaryMealsDone(status.primaryMealsDone ? [meal("breakfast", { textNote: "奶昔" })] : [])).toBe(1);
    expect(status.primaryMealsDone).toBe(1);
    expect(status.waterDone).toBe(true);
    expect(status.sleepDone).toBe(false);
    expect(formatCoachingTodayStatusLine(status)).toContain("1/3 餐");
  });

  it("shows no report when nothing submitted", () => {
    const status = buildCoachingTodayStatus({
      enrollmentId: "enroll-1",
      customerId: "cust-1",
      customerDisplayName: "Kevin",
      goal: null,
      logDate: "2026-08-11",
      log: null,
      meals: [],
    });

    expect(status.hasReport).toBe(false);
    expect(formatCoachingTodayStatusLine(status)).toBe("今日尚未回報");
  });
});
