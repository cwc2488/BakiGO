import { describe, expect, it } from "vitest";
import { assessBowelMovementSignal } from "@/lib/coaching/ai/bowel-movement-signal";

describe("bowel-movement-signal", () => {
  it("bowel_movement_count = 5 → elevated_today + coach copy", () => {
    const result = assessBowelMovementSignal({ todayCount: 5 });
    expect(result.level).toBe("elevated_today");
    expect(result.todayCount).toBe(5);
    expect(result.coachCopy).toBeTruthy();
    expect(result.coachCopy).toContain("排便");
  });

  it("no diarrhea/disease wording in customer copy by default", () => {
    const result = assessBowelMovementSignal({ todayCount: 5 });
    expect(result.customerCopy).toBeTruthy();
    const copy = result.customerCopy ?? "";
    expect(copy).not.toMatch(/腹瀉|拉肚子|疾病|病|diarrhea/i);
    expect(result.suggestProfessionalCare).toBe(false);
  });
});
