import { describe, expect, it } from "vitest";
import {
  clampLogDatesToEnrollmentWindow,
  coachingJourneyDayNumberInWindow,
  defaultPlannedEndDate,
  isLogDateInEnrollmentWindow,
} from "@/lib/coaching/enrollment-window";

describe("enrollment-window", () => {
  const startedAt = "2026-08-01T00:00:00+08:00";

  it("Day 1 = start date", () => {
    expect(
      coachingJourneyDayNumberInWindow({
        startedAt,
        plannedEndAt: "2026-10-29",
        logDate: "2026-08-01",
      }),
    ).toBe(1);
  });

  it("before start → null day / not in window", () => {
    expect(
      coachingJourneyDayNumberInWindow({
        startedAt,
        plannedEndAt: "2026-10-29",
        logDate: "2026-07-31",
      }),
    ).toBeNull();
    expect(
      isLogDateInEnrollmentWindow({
        startedAt,
        plannedEndAt: "2026-10-29",
        logDate: "2026-07-31",
      }),
    ).toBe(false);
  });

  it("after planned end → not in window", () => {
    expect(
      coachingJourneyDayNumberInWindow({
        startedAt,
        plannedEndAt: "2026-08-10",
        logDate: "2026-08-11",
      }),
    ).toBeNull();
    expect(
      isLogDateInEnrollmentWindow({
        startedAt,
        plannedEndAt: "2026-08-10",
        logDate: "2026-08-11",
      }),
    ).toBe(false);
  });

  it("default end = start + 89 days", () => {
    expect(defaultPlannedEndDate("2026-08-01")).toBe("2026-10-29");
    expect(
      coachingJourneyDayNumberInWindow({
        startedAt,
        logDate: "2026-10-29",
      }),
    ).toBe(90);
    expect(
      isLogDateInEnrollmentWindow({
        startedAt,
        logDate: "2026-10-30",
      }),
    ).toBe(false);
  });

  it("clamp calendar: pre-start and post-end omitted from missing", () => {
    const clamped = clampLogDatesToEnrollmentWindow({
      startedAt,
      plannedEndAt: "2026-08-05",
      logDates: [
        "2026-07-30",
        "2026-07-31",
        "2026-08-01",
        "2026-08-03",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
      ],
    });
    expect(clamped).toEqual(["2026-08-01", "2026-08-03", "2026-08-05"]);
  });
});
