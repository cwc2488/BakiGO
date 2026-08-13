import { describe, expect, it } from "vitest";
import {
  buildDenseSubmissionCalendar,
  countConsecutiveMissingCompletedDays,
} from "@/lib/coaching/attention/build-dense-submission-calendar";

describe("enrollment attention clamp", () => {
  it("buildDenseSubmissionCalendar clamps to start/end", () => {
    const calendar = buildDenseSubmissionCalendar({
      asOfLogDate: "2026-08-12",
      windowDays: 14,
      logs: [],
      enrollmentStartDate: "2026-08-10",
      enrollmentPlannedEndDate: "2026-08-11",
    });
    const dates = calendar.map((day) => day.logDate).sort();
    expect(dates).toEqual(["2026-08-10", "2026-08-11"]);
    expect(calendar.every((day) => day.presence === "missing")).toBe(true);
  });

  it("future start enrollment asOf today → no consecutive missing from pre-start days", () => {
    const asOf = "2026-08-12";
    const calendar = buildDenseSubmissionCalendar({
      asOfLogDate: asOf,
      windowDays: 14,
      logs: [],
      enrollmentStartDate: "2026-08-20",
      enrollmentPlannedEndDate: "2026-11-17",
    });
    expect(calendar).toEqual([]);
    const consecutive = countConsecutiveMissingCompletedDays({
      asOfLogDate: asOf,
      asOfHourTaipei: 15,
      calendar,
    });
    expect(consecutive).toBe(0);
  });

  it("past planned end → no new missing for dates after end", () => {
    const asOf = "2026-08-12";
    const calendar = buildDenseSubmissionCalendar({
      asOfLogDate: asOf,
      windowDays: 14,
      logs: [{ logDate: "2026-08-05", submitted: true }],
      enrollmentStartDate: "2026-08-01",
      enrollmentPlannedEndDate: "2026-08-05",
    });
    expect(calendar.some((day) => day.logDate > "2026-08-05")).toBe(false);
    expect(calendar.find((day) => day.logDate === "2026-08-12")).toBeUndefined();
    const consecutive = countConsecutiveMissingCompletedDays({
      asOfLogDate: asOf,
      asOfHourTaipei: 15,
      calendar,
    });
    // asOf is outside calendar; streak stops when date absent from dense map
    expect(consecutive).toBe(0);
  });
});
