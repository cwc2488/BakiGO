import { describe, expect, it } from "vitest";
import {
  buildMonthlyActivityProgress,
  monthlyActivityStatusLabel,
} from "@/lib/daily-action/monthly-activity-progress";

describe("monthly activity progress (OR logic)", () => {
  it("marks completed when consultation target met", () => {
    const view = buildMonthlyActivityProgress({
      yearMonth: "2026-08",
      monthlyConsultation: { current: 7, target: 7, progressPercent: 100, isRuleMissing: false },
      monthlyMeasurement: { current: 10, target: 30, progressPercent: 33, isRuleMissing: false },
    });
    expect(view.status).toBe("completed");
    expect(view.completedVia).toBe("consultation");
    expect(monthlyActivityStatusLabel(view.status)).toBe("已達成");
  });

  it("marks completed when measurement target met", () => {
    const view = buildMonthlyActivityProgress({
      yearMonth: "2026-08",
      monthlyConsultation: { current: 2, target: 7, progressPercent: 28, isRuleMissing: false },
      monthlyMeasurement: { current: 30, target: 30, progressPercent: 100, isRuleMissing: false },
    });
    expect(view.status).toBe("completed");
    expect(view.completedVia).toBe("measurement");
  });

  it("shows in progress when started but neither met", () => {
    const view = buildMonthlyActivityProgress({
      yearMonth: "2026-08",
      monthlyConsultation: { current: 3, target: 7, progressPercent: 42, isRuleMissing: false },
      monthlyMeasurement: { current: 12, target: 30, progressPercent: 40, isRuleMissing: false },
    });
    expect(view.status).toBe("in_progress");
    expect(view.remainingHint).toBe("還差 4 個諮詢 或 18 個量測");
  });

  it("shows not started at zero", () => {
    const view = buildMonthlyActivityProgress({
      yearMonth: "2026-08",
      monthlyConsultation: { current: 0, target: 7, progressPercent: 0, isRuleMissing: false },
      monthlyMeasurement: { current: 0, target: 30, progressPercent: 0, isRuleMissing: false },
    });
    expect(view.status).toBe("not_started");
  });

  it("surfaces rule missing state", () => {
    const view = buildMonthlyActivityProgress({
      yearMonth: "2026-08",
      monthlyConsultation: { current: 0, target: null, progressPercent: null, isRuleMissing: true },
      monthlyMeasurement: { current: 0, target: 30, progressPercent: 0, isRuleMissing: false },
    });
    expect(view.isRuleMissing).toBe(true);
  });
});
