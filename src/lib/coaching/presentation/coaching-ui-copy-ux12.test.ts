import { describe, expect, it } from "vitest";
import { formatCommandCenterSectionLabel } from "@/lib/coaching/attention/command-center-copy";
import {
  formatAttentionTierLabel,
  formatCoachingDayProgressLabel,
  formatGrowthSummaryTone,
  formatInterventionSuggestionLabel,
  formatMeasurementStageLabel,
  formatOutcomeStatusLabel,
  GROWTH_UI_LABELS,
  mapGrowthWhyEvidenceToZh,
  sanitizeCoachFacingEvidenceLines,
} from "@/lib/coaching/presentation/coaching-ui-copy";
import { REFERRAL_UI_STATE_LABELS } from "@/lib/coaching/referral-share/referral-presentation";

describe("COPY Coach-facing presentation", () => {
  it("COPY-01 — does not output raw outcome enum", () => {
    expect(formatOutcomeStatusLabel("not_yet_measurable")).toBe("等待下一次量測");
    expect(formatOutcomeStatusLabel("improving")).toBe("進展良好");
    expect(formatOutcomeStatusLabel("mixed")).toBe("有進展，仍需留意");
    expect(formatOutcomeStatusLabel("flat")).toBe("最近變化不明顯");
    expect(formatMeasurementStageLabel("baseline_only")).toBe("目前只有起始量測");
    expect(formatOutcomeStatusLabel("not_yet_measurable")).not.toContain("not_yet_measurable");
    expect(formatMeasurementStageLabel("baseline_only")).not.toContain("baseline_only");
  });

  it("COPY-02 — does not output raw attention enum", () => {
    expect(formatAttentionTierLabel("coach_attention")).toBe("建議今天關心");
    expect(formatAttentionTierLabel("watch")).toBe("持續觀察");
    expect(formatAttentionTierLabel("routine")).toBe("陪跑中");
    expect(formatCommandCenterSectionLabel("needs_attention")).toBe("需要處理");
    expect(formatInterventionSuggestionLabel("coach_attention")).not.toContain("coach_attention");
  });

  it("COPY-03 — does not output snake_case reason code", () => {
    const lines = mapGrowthWhyEvidenceToZh([
      "blocks=rescue_active,struggle_active",
      "recurring_late_sleep",
      "outcome_flat_two_period",
    ]);
    const joined = lines.join("|");
    expect(joined).not.toContain("rescue_active");
    expect(joined).not.toContain("struggle_active");
    expect(joined).not.toContain("recurring_late_sleep");
    expect(joined).not.toContain("outcome_flat_two_period");
  });

  it("COPY-04 — does not output UUID/debug evidence", () => {
    const lines = sanitizeCoachFacingEvidenceLines([
      "evidence=bfd17793-5fce-4a26-b6f8-dea0590093e9",
      "fingerprint=abc123",
      "顧客最近比較晚睡",
    ]);
    expect(lines.join("|")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(lines.join("|")).not.toContain("fingerprint");
    expect(lines.some((l) => l.includes("晚睡"))).toBe(true);
  });

  it("COPY-05 — Day N → 中文陪跑天數", () => {
    expect(formatCoachingDayProgressLabel(12, 90)).toBe("第 12 天｜90 天陪跑");
    expect(formatCoachingDayProgressLabel(null, 90)).toBe("90 天陪跑");
  });

  it("COPY-06 — Command Center action-first copy", () => {
    expect(formatCommandCenterSectionLabel("measurement_due")).toBe("建議安排回測");
    expect(formatCommandCenterSectionLabel("positive_progress")).toBe("進展良好");
    expect(formatCommandCenterSectionLabel("watch")).toBe("持續觀察");
  });

  it("COPY-07 — Growth summary 中文化", () => {
    expect(formatGrowthSummaryTone({ suitableNow: true })).toBe(GROWTH_UI_LABELS.summarySuitable);
    expect(GROWTH_UI_LABELS.sectionTitle).toBe("成果與分享機會");
    expect(GROWTH_UI_LABELS.whyTitle).toBe("判斷依據");
  });

  it("COPY-08 — Referral states 中文化", () => {
    for (const label of Object.values(REFERRAL_UI_STATE_LABELS)) {
      expect(/[\u4e00-\u9fff]/.test(label)).toBe(true);
      expect(label).not.toMatch(/_/);
    }
    expect(REFERRAL_UI_STATE_LABELS.not_assessed).toBe("尚未評估");
    expect(REFERRAL_UI_STATE_LABELS.pause_care_first).toBe("目前先關心");
  });
});
