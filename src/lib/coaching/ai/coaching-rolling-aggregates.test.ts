import { describe, expect, it } from "vitest";
import {
  buildCoachingRollingAggregates,
  buildCoachingRollingMemory,
  detectCoachingRecurringPatterns,
} from "@/lib/coaching/ai/coaching-rolling-aggregates";
import type { CoachingDailyLogDetail } from "@/types/coaching";

function log(logDate: string, overrides?: Partial<CoachingDailyLogDetail>): CoachingDailyLogDetail {
  return {
    id: `log-${logDate}`,
    enrollmentId: "enroll-1",
    customerId: "cust-1",
    ownerMemberId: "member-1",
    logDate,
    waterMl: 1800,
    exerciseNote: "快走",
    bowelMovementCount: 1,
    sleepDuration: "7小時",
    sleepBedtime: "23:30",
    sleepWakeTime: "07:00",
    customerNote: null,
    submittedAt: `${logDate}T09:00:00.000Z`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    meals: [
      {
        id: "breakfast",
        dailyLogId: `log-${logDate}`,
        mealSlot: "breakfast",
        textNote: "奶昔",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: null,
      },
      {
        id: "lunch",
        dailyLogId: `log-${logDate}`,
        mealSlot: "lunch",
        textNote: "便當",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: null,
      },
      {
        id: "dinner",
        dailyLogId: `log-${logDate}`,
        mealSlot: "dinner",
        textNote: "沙拉",
        eatenAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        photo: null,
      },
    ],
    ...overrides,
  };
}

describe("coaching rolling aggregates", () => {
  it("computes 14-day deterministic aggregates", () => {
    const logs = [
      log("2026-08-11"),
      log("2026-08-10", { waterMl: 900, sleepBedtime: "00:15", sleepWakeTime: "07:00" }),
      log("2026-08-09", { exerciseNote: null, meals: [] }),
    ];

    const aggregates = buildCoachingRollingAggregates(logs, 14);
    expect(aggregates.daysWithReport).toBe(3);
    expect(aggregates.daysSubmitted).toBe(3);
    expect(aggregates.breakfastCompletionRate).toBeGreaterThan(0);
    expect(aggregates.averageWaterMl).toBe(1500);
    expect(aggregates.lateSleepDays).toBeGreaterThanOrEqual(1);
    expect(aggregates.exerciseDays).toBe(2);
    expect(aggregates.bowelMovementSummary.totalCount).toBe(3);
  });

  it("detects objective recurring patterns without LLM", () => {
    const aggregates = buildCoachingRollingAggregates(
      [
        log("2026-08-11", { sleepBedtime: "00:30", sleepWakeTime: "07:00" }),
        log("2026-08-10", { sleepBedtime: "01:00", sleepWakeTime: "07:00" }),
        log("2026-08-09", { sleepBedtime: "23:45", sleepWakeTime: "07:00" }),
        log("2026-08-08", { sleepBedtime: "00:15", sleepWakeTime: "07:00" }),
        log("2026-08-07", { sleepBedtime: "02:00", sleepWakeTime: "07:00" }),
      ],
      14,
    );

    const patterns = detectCoachingRecurringPatterns(aggregates);
    expect(patterns).toContain("late_sleep_pattern");
    expect(patterns).not.toContain("water_consistently_low");
    expect(patterns).not.toContain("steady_participation");
  });

  it("keeps only recent raw days in rolling memory", () => {
    const logs = Array.from({ length: 6 }, (_, index) => log(`2026-08-${String(11 - index).padStart(2, "0")}`));
    const memory = buildCoachingRollingMemory(logs, 14, 3);
    expect(memory.recentDays).toHaveLength(3);
    expect(memory.aggregates.windowDays).toBe(14);
  });
});
