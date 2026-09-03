import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatTrainingDisplayDate,
  formatTrainingItemNumber,
} from "@/components/training/training-ui";

describe("training premium UI presentation", () => {
  it("formats display date with dots and padded item numbers", () => {
    expect(formatTrainingDisplayDate("2026-09-03T12:00:00.000Z")).toBe("2026.09.03");
    expect(formatTrainingItemNumber(1)).toBe("01");
    expect(formatTrainingItemNumber(18)).toBe("18");
  });

  it("keeps premium copy without scores/percent/gamification", () => {
    const panel = readFileSync(
      resolve(process.cwd(), "src/components/training/TrainingChecklistViewPanel.tsx"),
      "utf8",
    );
    const ui = readFileSync(
      resolve(process.cwd(), "src/components/training/training-ui.tsx"),
      "utf8",
    );
    const org = readFileSync(
      resolve(process.cwd(), "src/components/training/TrainingOrganizationPage.tsx"),
      "utf8",
    );

    expect(panel).toContain("建立你的專業基本功");
    expect(panel).toContain("尚待培訓");
    expect(panel).toContain("已簽核");
    expect(panel).toContain("確認完成培訓");
    expect(panel).toContain("TrainingLearningLink");
    expect(panel).toContain("培訓項目已全部完成");
    expect(ui).toContain("尚未完成");
    expect(ui).toContain("已完成");
    expect(ui).toContain("前往學習");
    expect(org).toContain("全部完成");

    for (const src of [panel, ui, org]) {
      expect(src).not.toMatch(/完成率|星等|雷達|排行榜|AI 評分|confetti/i);
      expect(src).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
      expect(src).not.toContain("目前沒有教材");
      expect(src).not.toContain("尚未建立教材");
    }
  });

  it("does not change API/auth/service modules in this UI pass", () => {
    // Guard: premium UI mission should only touch presentation files.
    const service = readFileSync(
      resolve(process.cwd(), "src/lib/training/training-service.ts"),
      "utf8",
    );
    expect(service).toContain("signer_member_id: input.viewerMemberId");
    expect(service).toContain("xpro_deep_nutrition");
  });
});
