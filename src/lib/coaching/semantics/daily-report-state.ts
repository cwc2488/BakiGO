import { isMealReported } from "@/lib/coaching/coaching-completion";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
import { PRIMARY_MEAL_SLOTS, type CoachingDailyLogDetail } from "@/types/coaching";
import type { DailyFactRow, DailyReportState } from "@/lib/coaching/semantics/types";

const REQUIRED_KEYS = ["breakfast", "lunch", "dinner", "water", "sleep"] as const;

export type DailyReportSemantics = {
  state: DailyReportState;
  hasMeaningfulReport: boolean;
  missingRequired: string[];
  facts: DailyFactRow[];
  coachStatusLine: string;
};

function isSleepReported(log: CoachingDailyLogDetail | null | undefined): boolean {
  if (!log) return false;
  return Boolean(log.sleepBedtime?.trim() && log.sleepWakeTime?.trim()) || Boolean(log.sleepDuration?.trim());
}

function mealFact(log: CoachingDailyLogDetail | null | undefined, slot: "breakfast" | "lunch" | "dinner"): DailyFactRow {
  const labels = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" } as const;
  const entry = log?.meals?.find((item) => item.mealSlot === slot);
  const reported = isMealReported(entry);
  const note = entry?.textNote?.trim() || "";
  return {
    key: slot,
    label: labels[slot],
    mark: reported ? "done" : "missing",
    value: reported ? note || "✓" : "—",
  };
}

/**
 * Canonical daily completeness for Customer + Coach.
 * `submittedAt` is not authority — Go21 chat can fill slots without portal submit.
 */
export function resolveDailyReportState(
  log: CoachingDailyLogDetail | null | undefined,
): DailyReportSemantics {
  const breakfast = mealFact(log, "breakfast");
  const lunch = mealFact(log, "lunch");
  const dinner = mealFact(log, "dinner");
  const waterDone = log?.waterMl != null;
  const sleepDone = isSleepReported(log);
  const exerciseDone = Boolean(log?.exerciseNote?.trim());
  const bowelDone = log?.bowelMovementCount != null;
  const note = log?.customerNote?.trim() || "";

  const water: DailyFactRow = {
    key: "water",
    label: "水",
    mark: waterDone ? "done" : "missing",
    value: waterDone ? `${Math.max(0, Math.floor(log!.waterMl!))} ml` : "—",
  };
  const sleepLabel =
    log?.sleepDuration?.trim() ||
    (log?.sleepBedtime && log?.sleepWakeTime
      ? formatSleepTimeRange(log.sleepBedtime, log.sleepWakeTime)
      : null);
  const sleep: DailyFactRow = {
    key: "sleep",
    label: "睡眠",
    mark: sleepDone ? "done" : "missing",
    value: sleepLabel?.trim() || "—",
  };
  const exercise: DailyFactRow = {
    key: "exercise",
    label: "運動",
    mark: exerciseDone ? "done" : "not_applicable",
    value: log?.exerciseNote?.trim() || "—",
  };
  const bowel: DailyFactRow = {
    key: "bowel",
    label: "排便",
    mark: bowelDone ? "done" : "not_applicable",
    value: bowelDone ? `${Math.max(0, Math.floor(log!.bowelMovementCount!))} 次` : "—",
  };

  const facts: DailyFactRow[] = [breakfast, lunch, dinner, water, sleep, exercise, bowel];
  if (note) {
    facts.push({
      key: "note",
      label: "顧客原文",
      mark: "partial",
      value: note,
    });
  }

  const hasMeaningfulReport = Boolean(
    log?.submittedAt ||
      breakfast.mark === "done" ||
      lunch.mark === "done" ||
      dinner.mark === "done" ||
      waterDone ||
      sleepDone ||
      exerciseDone ||
      bowelDone ||
      note ||
      (log?.meals ?? []).some((meal) => isMealReported(meal)),
  );

  const required = { breakfast, lunch, dinner, water, sleep };
  const missingRequired = REQUIRED_KEYS.filter((key) => required[key].mark !== "done").map((key) => {
    if (key === "breakfast") return "早餐";
    if (key === "lunch") return "午餐";
    if (key === "dinner") return "晚餐";
    if (key === "water") return "水";
    return "睡眠";
  });

  let state: DailyReportState = "NO_REPORT";
  if (!hasMeaningfulReport) {
    state = "NO_REPORT";
  } else if (missingRequired.length === 0) {
    state = "COMPLETE_REPORT";
  } else {
    state = "PARTIAL_REPORT";
  }

  const coachStatusLine =
    state === "NO_REPORT"
      ? "今天尚未回報"
      : state === "COMPLETE_REPORT"
        ? "今天已完成回報"
        : `今天已開始回報，尚有項目未完成（${missingRequired.join("、")}）`;

  return { state, hasMeaningfulReport, missingRequired, facts, coachStatusLine };
}

export function primaryMealsReportedCount(log: CoachingDailyLogDetail | null | undefined): number {
  return PRIMARY_MEAL_SLOTS.filter((slot) => {
    const entry = log?.meals?.find((item) => item.mealSlot === slot);
    return isMealReported(entry);
  }).length;
}
