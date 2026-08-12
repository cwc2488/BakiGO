import { describe, expect, it } from "vitest";
import {
  formatGrowthSummaryTone,
  formatMeasuredOutcomeDisplay,
  GROWTH_UI_LABELS,
  mapGrowthWhyEvidenceToZh,
} from "@/lib/coaching/presentation/coaching-ui-copy";

describe("coaching-ui-copy", () => {
  it("maps measured_outcome debug lines to Traditional Chinese", () => {
    const lines = mapGrowthWhyEvidenceToZh([
      "measured_outcome=not_yet_measurable/baseline_only→low",
      "experience=high(checkin:bfd17793-5fce-4a26-b6f8-dea0590093e9)",
      "scales: perception=5 helpfulness=4 satisfaction=5 willingness=8",
      "felt_change=精神明顯變好",
      "blocks=ask_recent,cooldown_active",
      "primary_path=coach_assisted_referral",
    ]);
    expect(lines.some((l) => l.includes("尚未進行第二次量測"))).toBe(true);
    expect(lines.some((l) => l.includes("目前只有起始量測"))).toBe(true);
    expect(lines.some((l) => l.includes("顧客體驗回饋偏高"))).toBe(true);
    expect(lines.some((l) => l.includes("精神明顯變好"))).toBe(true);
    expect(lines.some((l) => l.includes("教練協助轉介紹"))).toBe(true);
    expect(lines.join("")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(lines.join("")).not.toContain("measured_outcome=");
    expect(lines.join("")).not.toContain("blocks=");
  });

  it("formats growth summary tones", () => {
    expect(formatGrowthSummaryTone({ suitableNow: true })).toBe(GROWTH_UI_LABELS.summarySuitable);
    expect(formatGrowthSummaryTone({ suitableNow: false, inviteCheckin: true })).toBe(
      GROWTH_UI_LABELS.summaryContinue,
    );
    expect(formatGrowthSummaryTone({ suitableNow: false })).toBe(GROWTH_UI_LABELS.summaryNotSuitable);
  });

  it("formats measured outcome without raw enums", () => {
    const text = formatMeasuredOutcomeDisplay({
      outcomeStatus: "not_yet_measurable",
      outcomeBand: "low",
    });
    expect(text).toContain("尚未進行第二次量測");
    expect(text).not.toContain("not_yet_measurable");
  });
});
