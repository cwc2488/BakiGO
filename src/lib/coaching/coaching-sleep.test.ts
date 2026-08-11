import { describe, expect, it } from "vitest";
import {
  calculateSleepDurationMinutes,
  computeSleepDurationLabel,
  formatSleepDurationMinutes,
  isLateBedtime,
  normalizeClockTimeInput,
  parseClockTimeToMinutes,
  parseSleepDurationLabelToMinutes,
} from "@/lib/coaching/coaching-sleep";

describe("coaching sleep", () => {
  it("parses clock times", () => {
    expect(parseClockTimeToMinutes("23:30")).toBe(23 * 60 + 30);
    expect(parseClockTimeToMinutes("07:00:00")).toBe(7 * 60);
    expect(parseClockTimeToMinutes("invalid")).toBeNull();
  });

  it("handles cross-midnight sleep", () => {
    expect(calculateSleepDurationMinutes("23:30", "07:00")).toBe(7 * 60 + 30);
    expect(calculateSleepDurationMinutes("00:30", "07:30")).toBe(7 * 60);
  });

  it("formats duration labels", () => {
    expect(formatSleepDurationMinutes(450)).toBe("7小時30分");
    expect(formatSleepDurationMinutes(420)).toBe("7小時");
    expect(computeSleepDurationLabel("23:30", "07:00")).toBe("7小時30分");
  });

  it("normalizes input clock values", () => {
    expect(normalizeClockTimeInput("7:05")).toBe("07:05");
    expect(normalizeClockTimeInput("")).toBeNull();
  });

  it("parses sleep duration labels", () => {
    expect(parseSleepDurationLabelToMinutes("7小時30分")).toBe(450);
    expect(parseSleepDurationLabelToMinutes("7小時")).toBe(420);
  });

  it("flags late bedtime across midnight window", () => {
    expect(isLateBedtime("22:30")).toBe(false);
    expect(isLateBedtime("23:00")).toBe(true);
    expect(isLateBedtime("00:30")).toBe(true);
    expect(isLateBedtime("02:00")).toBe(true);
    expect(isLateBedtime("06:30")).toBe(false);
  });
});
