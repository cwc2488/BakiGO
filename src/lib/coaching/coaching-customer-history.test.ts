import { describe, expect, it } from "vitest";
import {
  COACHING_DAY_UI_STATUS_LABELS,
  mapCoachingDayUiStatus,
} from "@/lib/coaching/coaching-day-status";
import { coachingJourneyDayNumber } from "@/lib/coaching/list-coaching-recent-day-summaries";

describe("customer coaching history helpers", () => {
  it("maps portal day statuses with customer-facing labels", () => {
    expect(mapCoachingDayUiStatus({ hasLog: false, submittedAt: null, aiStatus: "missing" })).toBe(
      "not_started",
    );
    expect(COACHING_DAY_UI_STATUS_LABELS.not_started).toBe("未回報");
    expect(COACHING_DAY_UI_STATUS_LABELS.ai_ready).toBe("AI 已完成");
    expect(COACHING_DAY_UI_STATUS_LABELS.ai_analyzing).toBe("AI 分析中");
    expect(COACHING_DAY_UI_STATUS_LABELS.ai_unavailable).toBe("AI 暫時無法生成");
  });

  it("computes Day X / 90 from enrollment start", () => {
    expect(
      coachingJourneyDayNumber({
        enrollmentStartedAt: "2026-08-01T00:00:00.000Z",
        logDate: "2026-08-01",
      }),
    ).toBe(1);
    expect(
      coachingJourneyDayNumber({
        enrollmentStartedAt: "2026-08-01T00:00:00.000Z",
        logDate: "2026-08-12",
      }),
    ).toBe(12);
  });
});
