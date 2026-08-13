import { describe, expect, it } from "vitest";
import {
  buildImmediateDailyFeedback,
  buildImmediateDirectiveLines,
  buildImmediateDirectiveSignalsFromMeals,
} from "@/lib/coaching/immediate-daily-feedback";
import type { CoachingDailyLogDetail, CoachingMealEntryWithPhoto } from "@/types/coaching";

function meal(
  slot: CoachingMealEntryWithPhoto["mealSlot"],
  opts: { text?: string; photo?: boolean } = {},
): CoachingMealEntryWithPhoto {
  return {
    id: `meal-${slot}`,
    dailyLogId: "log-1",
    mealSlot: slot,
    textNote: opts.text ?? null,
    eatenAt: null,
    createdAt: "",
    updatedAt: "",
    photo: opts.photo
      ? {
          id: `photo-${slot}`,
          mealEntryId: `meal-${slot}`,
          storagePath: `path/${slot}.jpg`,
          uploadedAt: "2026-08-13T08:00:00.000Z",
          createdAt: "2026-08-13T08:00:00.000Z",
        }
      : null,
  };
}

function baseLog(partial: Partial<CoachingDailyLogDetail> = {}): CoachingDailyLogDetail {
  return {
    id: "55623ae1-05ef-428e-894f-b6948f097d5e",
    enrollmentId: "enroll-1",
    customerId: "cust-1",
    ownerMemberId: "owner-1",
    logDate: "2026-08-13",
    waterMl: null,
    exerciseNote: null,
    bowelMovementCount: null,
    sleepBedtime: null,
    sleepWakeTime: null,
    sleepDuration: null,
    customerNote: null,
    submittedAt: "2026-08-13T08:21:19.398+00:00",
    createdAt: "",
    updatedAt: "",
    meals: [],
    ...partial,
  };
}

describe("immediate-daily-feedback P0", () => {
  it("P0-01/04/05/06/07 builds meal water sleep activity lines", () => {
    const feedback = buildImmediateDailyFeedback({
      dailyLog: baseLog({
        waterMl: 2000,
        sleepDuration: "7小時",
        exerciseNote: "走路20分",
        meals: [
          meal("breakfast", { photo: true }),
          meal("lunch", { photo: true }),
          meal("dinner", { text: "清淡" }),
        ],
      }),
    });
    expect(feedback.lines[0]).toContain("三餐都有完成回報");
    expect(feedback.lines.some((line) => line.includes("2000 ml"))).toBe(true);
    expect(feedback.lines.some((line) => line.includes("睡眠 7小時"))).toBe(true);
    expect(feedback.lines.some((line) => line.includes("走路20分"))).toBe(true);
  });

  it("P0-08 bowel=5 uses existing safe elevated reminder", () => {
    const feedback = buildImmediateDailyFeedback({
      dailyLog: baseLog({
        bowelMovementCount: 5,
        meals: [meal("breakfast", { photo: true })],
      }),
    });
    expect(feedback.lines.some((line) => line.includes("排便 5 次"))).toBe(true);
    expect(feedback.lines.some((line) => /水分|休息|身體/.test(line))).toBe(true);
    expect(feedback.lines.join("")).not.toMatch(/腹瀉|診斷|疾病/);
  });

  it("P0-09 directive deterministic signal without vision claims", () => {
    const signals = buildImmediateDirectiveSignalsFromMeals({
      meals: [meal("breakfast", { photo: true })],
      directives: [{ mealSlot: "breakfast", instructionText: "早餐喝奶昔" }],
    });
    const lines = buildImmediateDirectiveLines(signals);
    expect(lines[0]).toContain("已回報對應餐次");
    expect(lines[0]).toContain("早餐喝奶昔");
    expect(lines.join("")).not.toMatch(/照片可見|未喝/);
  });

  it("partial meals line is honest", () => {
    const feedback = buildImmediateDailyFeedback({
      dailyLog: baseLog({
        meals: [meal("breakfast", { photo: true })],
      }),
    });
    expect(feedback.lines[0]).toContain("1/3");
  });
});
