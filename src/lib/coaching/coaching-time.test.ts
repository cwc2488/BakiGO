import { describe, expect, it } from "vitest";
import {
  coachingDaySpeechLabel,
  coachingLogDateOffset,
  coachingRelativeDayLabel,
  coachingTodayLogDate,
  isAllowedCoachingLogDate,
  listCoachingBackfillLogDates,
  listCoachingRecentLogDates,
  relativeCoachingDayKey,
} from "@/lib/coaching/coaching-time";
import { mapCoachingDayUiStatus } from "@/lib/coaching/coaching-day-status";

describe("coaching-time recent 3-day window", () => {
  // Fixed instant: 2026-08-12 10:00 Asia/Taipei = 2026-08-12 02:00 UTC
  const now = new Date("2026-08-12T02:00:00.000Z");

  it("computes Taipei today and offsets", () => {
    expect(coachingTodayLogDate("Asia/Taipei", now)).toBe("2026-08-12");
    expect(coachingLogDateOffset(0, "Asia/Taipei", now)).toBe("2026-08-12");
    expect(coachingLogDateOffset(-1, "Asia/Taipei", now)).toBe("2026-08-11");
    expect(coachingLogDateOffset(-2, "Asia/Taipei", now)).toBe("2026-08-10");
  });

  it("lists recent and backfill order", () => {
    expect(listCoachingRecentLogDates("Asia/Taipei", now)).toEqual([
      "2026-08-12",
      "2026-08-11",
      "2026-08-10",
    ]);
    expect(listCoachingBackfillLogDates("Asia/Taipei", now)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
    ]);
  });

  it("validates allowlist and relative labels", () => {
    expect(isAllowedCoachingLogDate("2026-08-12", "Asia/Taipei", now)).toBe(true);
    expect(isAllowedCoachingLogDate("2026-08-09", "Asia/Taipei", now)).toBe(false);
    expect(isAllowedCoachingLogDate("not-a-date", "Asia/Taipei", now)).toBe(false);
    expect(relativeCoachingDayKey("2026-08-11", "Asia/Taipei", now)).toBe("yesterday");
    expect(coachingRelativeDayLabel("2026-08-10", "Asia/Taipei", now)).toBe("前天");
    expect(coachingDaySpeechLabel("2026-08-11", "Asia/Taipei", now)).toBe("昨天");
  });
});

describe("coaching day UI status mapping", () => {
  it("maps report + AI states", () => {
    expect(mapCoachingDayUiStatus({ hasLog: false, submittedAt: null, aiStatus: null })).toBe(
      "not_started",
    );
    expect(mapCoachingDayUiStatus({ hasLog: true, submittedAt: null, aiStatus: "missing" })).toBe(
      "draft",
    );
    expect(
      mapCoachingDayUiStatus({ hasLog: true, submittedAt: "2026-08-12T01:00:00Z", aiStatus: "missing" }),
    ).toBe("submitted");
    expect(
      mapCoachingDayUiStatus({
        hasLog: true,
        submittedAt: "2026-08-12T01:00:00Z",
        aiStatus: "processing",
      }),
    ).toBe("ai_analyzing");
    expect(
      mapCoachingDayUiStatus({
        hasLog: true,
        submittedAt: "2026-08-12T01:00:00Z",
        aiStatus: "completed",
      }),
    ).toBe("ai_ready");
    expect(
      mapCoachingDayUiStatus({
        hasLog: true,
        submittedAt: "2026-08-12T01:00:00Z",
        aiStatus: "failed",
      }),
    ).toBe("ai_unavailable");
  });
});
