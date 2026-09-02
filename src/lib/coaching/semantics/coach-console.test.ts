import { describe, expect, it } from "vitest";
import { buildCoachConsoleView } from "@/lib/coaching/semantics/build-coach-console";
import { classifyCustomerFreeText } from "@/lib/coaching/semantics/free-text";
import { resolveDailyReportState } from "@/lib/coaching/semantics/daily-report-state";
import type { CoachingDailyLogDetail, CoachingMealEntryWithPhoto } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";

function meal(
  slot: CoachingMealEntryWithPhoto["mealSlot"],
  textNote: string | null,
): CoachingMealEntryWithPhoto {
  return {
    id: `${slot}-id`,
    dailyLogId: "log-1",
    mealSlot: slot,
    textNote,
    eatenAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    photo: null,
  };
}

function log(overrides: Partial<CoachingDailyLogDetail> = {}): CoachingDailyLogDetail {
  return {
    id: "log-1",
    enrollmentId: "enr-1",
    customerId: "cus-1",
    ownerMemberId: "mem-1",
    logDate: "2026-09-01",
    waterMl: null,
    exerciseNote: null,
    bowelMovementCount: null,
    sleepDuration: null,
    sleepBedtime: null,
    sleepWakeTime: null,
    customerNote: null,
    submittedAt: null,
    createdAt: "2026-09-01T01:00:00.000Z",
    updatedAt: "2026-09-01T01:00:00.000Z",
    meals: [],
    ...overrides,
  };
}

function record(id: string, date: string, values: Partial<BodyCompositionRecord> = {}): BodyCompositionRecord {
  return {
    id,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
    customerId: "cus-1",
    recordDate: date,
    age: 40,
    weightKg: 125.4,
    skeletalMuscleKg: 40.8,
    bodyFatKg: null,
    bmi: null,
    bodyFatPercent: 43.2,
    visceralFatLevel: null,
    basalMetabolicRate: null,
    bodyAge: null,
    ...values,
  };
}

const morning = new Date("2026-09-01T02:00:00.000Z"); // 10:00 Taipei
const afternoon = new Date("2026-09-01T06:00:00.000Z"); // 14:00 Taipei

describe("Coach Console semantic truth", () => {
  it("CASE 1 — breakfast exists, lunch/dinner missing → PARTIAL, never 尚未回報", () => {
    const dailyLog = log({
      waterMl: 1200,
      customerNote: "我今天早餐喝一杯奶昔、午餐吃蕎麥麵+3顆蛋。目前水喝1200cc",
      meals: [meal("breakfast", "奶昔")],
    });
    const view = buildCoachConsoleView({ dailyLog, now: afternoon });
    expect(view.report.state).toBe("PARTIAL_REPORT");
    expect(view.report.coachStatusLine).toContain("已開始回報");
    expect(view.report.coachStatusLine).not.toContain("尚未回報");
    expect(view.nextAction.title).not.toContain("還沒回報");
    expect(view.nextAction.body).not.toMatch(/完成今天的回報/);
    expect(JSON.stringify(view)).not.toContain("今天尚未回報");
  });

  it("CASE 2 — no daily data → NO_REPORT", () => {
    const view = buildCoachConsoleView({ dailyLog: null, now: morning });
    expect(view.report.state).toBe("NO_REPORT");
    expect(resolveDailyReportState(undefined).state).toBe("NO_REPORT");
  });

  it("CASE 3 — all required daily data complete → COMPLETE_REPORT", () => {
    const dailyLog = log({
      waterMl: 2000,
      sleepDuration: "7 小時",
      sleepBedtime: "23:00",
      sleepWakeTime: "06:30",
      submittedAt: "2026-09-01T12:00:00.000Z",
      meals: [
        meal("breakfast", "奶昔"),
        meal("lunch", "蕎麥麵+蛋"),
        meal("dinner", "雞胸＋菜"),
      ],
    });
    const view = buildCoachConsoleView({ dailyLog, now: afternoon });
    expect(view.report.state).toBe("COMPLETE_REPORT");
    expect(view.nextAction.title).toContain("已完成回報");
  });

  it("CASE 4 — only one measurement → INSUFFICIENT_DATA, never baseline → same baseline", () => {
    const baseline = record("m1", "2026-08-20");
    const view = buildCoachConsoleView({
      dailyLog: log(),
      baselineRecord: baseline,
      latestRecord: baseline,
      measurementStage: "baseline_only",
      outcomeStatus: "not_yet_measurable",
    });
    expect(view.measurements.every((row) => row.state === "INSUFFICIENT_DATA")).toBe(true);
    expect(view.measurementHeadline).toContain("目前只有起始量測");
    for (const row of view.measurements) {
      expect(row.displayLine).not.toMatch(/125\.4\s*→\s*125\.4/);
      expect(row.displayLine).not.toMatch(/43\.2\s*→\s*43\.2/);
    }
  });

  it("CASE 5 — two identical legitimate measurements → UNCHANGED", () => {
    const baseline = record("m1", "2026-08-20");
    const latest = record("m2", "2026-09-01");
    const view = buildCoachConsoleView({
      dailyLog: log(),
      baselineRecord: baseline,
      latestRecord: latest,
      measurementStage: "comparison_available",
      outcomeStatus: "flat",
    });
    expect(view.measurements.find((row) => row.key === "weightKg")?.state).toBe("UNCHANGED");
    expect(view.measurements.find((row) => row.key === "bodyFatPercent")?.state).toBe("UNCHANGED");
  });

  it("CASE 6 — 「再喝了2000的水」 is not FEELING and does not overwrite structured water", () => {
    const classified = classifyCustomerFreeText("再喝了2000的水");
    expect(classified?.class).not.toBe("FEELING");
    expect(classified?.class).toBe("OBSERVED_FACT");
    const view = buildCoachConsoleView({
      dailyLog: log({
        waterMl: 1200,
        customerNote: "再喝了2000的水",
        meals: [meal("breakfast", "奶昔")],
      }),
      now: morning,
    });
    expect(view.structuredWaterMl).toBe(1200);
    expect(view.freeTextWaterMl).toBe(2000);
    expect(view.waterConflict).toBe(true);
    expect(view.freeText?.class).not.toBe("FEELING");
    expect(view.aiJudgment.some((item) => item.conclusion.includes("結構化水分仍是 1200"))).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/顧客感受是/);
    expect(view.freeText?.displayLabel).not.toMatch(/感受/);
  });

  it("CASE 7 — hunger + 難忍 may classify as FEELING/CONCERN with evidence", () => {
    const classified = classifyCustomerFreeText("今天真的很餓，很難忍");
    expect(["FEELING", "CONCERN"]).toContain(classified?.class);
    const view = buildCoachConsoleView({
      dailyLog: log({
        customerNote: "今天真的很餓，很難忍",
        meals: [meal("breakfast", "奶昔")],
      }),
      now: morning,
    });
    expect(["FEELING", "CONCERN"]).toContain(view.freeText?.class);
    expect(view.aiJudgment.some((item) => item.evidence.some((ev) => ev.rawExcerpt?.includes("很餓")))).toBe(
      true,
    );
  });

  it("CASE 8 — explicit question is the primary coach action", () => {
    const view = buildCoachConsoleView({
      dailyLog: log({
        customerNote: "午餐可以吃蕎麥麵嗎？",
        meals: [meal("breakfast", "奶昔")],
        waterMl: 800,
      }),
      now: afternoon,
    });
    expect(view.freeText?.class).toBe("QUESTION");
    expect(view.nextAction.priority).toBe("question");
    expect(view.nextAction.title).toContain("問題");
  });

  it("CASE 9 — meaningful report + incomplete day does not say remind to complete today's report", () => {
    const view = buildCoachConsoleView({
      dailyLog: log({
        waterMl: 1200,
        meals: [meal("breakfast", "奶昔")],
      }),
      now: morning,
    });
    expect(view.report.state).toBe("PARTIAL_REPORT");
    expect(view.nextAction.body).not.toMatch(/完成今天的回報/);
    expect(view.nextAction.title).not.toBe("今天還沒回報");
    expect(view.nextAction.priority).toBe("none");
  });

  it("CASE 10 — baseline only share assessment is NOT_ENOUGH_DATA, not negative readiness", () => {
    const baseline = record("m1", "2026-08-20");
    const view = buildCoachConsoleView({
      dailyLog: log({ meals: [meal("breakfast", "奶昔")], waterMl: 1200 }),
      baselineRecord: baseline,
      latestRecord: baseline,
      measurementStage: "baseline_only",
      outcomeStatus: "not_yet_measurable",
      shareSuitableNow: false,
      shareReadiness: "not_ready",
    });
    expect(view.shareReadiness).toBe("NOT_ENOUGH_DATA");
    expect(view.shareCopy).toBe("資料還不足，等待下一次量測");
    expect(view.shareCopy).not.toContain("不適合談");
    expect(view.aiJudgment.flatMap((item) => [item.conclusion, ...item.evidence.map((ev) => ev.summary)]).join("\n")).not.toMatch(
      /NOT_ENOUGH_DATA|INSUFFICIENT_DATA|PARTIAL_REPORT/,
    );
  });
});
