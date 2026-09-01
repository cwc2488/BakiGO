import { coachingTaipeiHour } from "@/lib/coaching/coaching-time";
import { assessBowelMovementSignal } from "@/lib/coaching/ai/bowel-movement-signal";
import type { DailyReportSemantics } from "@/lib/coaching/semantics/daily-report-state";
import type { ClassifiedFreeText } from "@/lib/coaching/semantics/types";
import type { CoachNextAction } from "@/lib/coaching/semantics/types";
import type { MetricComparison } from "@/lib/coaching/semantics/types";

export function buildCoachNextAction(input: {
  report: DailyReportSemantics;
  freeText: ClassifiedFreeText | null;
  coachAttentionRequired?: boolean;
  attentionReason?: string | null;
  interventionLevel?: string | null;
  dailySummary?: string | null;
  bowelCount?: number | null;
  waterMl?: number | null;
  waterTargetMl?: number | null;
  measurements?: MetricComparison[];
  now?: Date;
}): CoachNextAction {
  const hour = coachingTaipeiHour(input.now);
  const missing = input.report.missingRequired;

  if (input.freeText?.class === "QUESTION") {
    return {
      priority: "question",
      title: "顧客提出問題",
      body: `她問：「${input.freeText.text}」。請先回覆這個問題。`,
      cta: "回覆顧客問題",
      showRecordAction: true,
      missingItems: missing,
    };
  }

  if (input.coachAttentionRequired || input.interventionLevel === "coach_attention") {
    return {
      priority: "safety",
      title: "今天需要你特別關心",
      body:
        input.attentionReason?.trim() ||
        input.dailySummary?.trim() ||
        "今天有需要教練介入的訊號，請先看完整回報再決定怎麼回。",
      cta: "查看並記錄已處理",
      showRecordAction: true,
      missingItems: missing,
    };
  }

  if (input.freeText && (input.freeText.class === "FEELING" || input.freeText.class === "CONCERN")) {
    return {
      priority: "safety",
      title: "顧客提到身體／執行上的困難",
      body: `顧客提到「${input.freeText.text}」。先回應這句話，不要把它當成一般心得帶過。`,
      cta: "回覆顧客",
      showRecordAction: true,
      missingItems: missing,
    };
  }

  const bowel = assessBowelMovementSignal({ todayCount: input.bowelCount ?? null });
  if (bowel.level === "elevated_today" || bowel.level === "repeated_elevated") {
    return {
      priority: "safety",
      title: "今天排便次數偏高",
      body: bowel.coachCopy || "今天排便次數較多，建議關心她目前的身體狀況。",
      cta: "關心並記錄",
      showRecordAction: true,
      missingItems: missing,
    };
  }

  if (input.report.state === "NO_REPORT") {
    const late = hour >= 20;
    return {
      priority: late ? "incomplete_item" : "none",
      title: late ? "今天還沒有回報" : "今天尚無回報",
      body: late
        ? "到現在還沒有任何今日紀錄。若平時這個時間已會回報，可以關心一下她是否方便補上。"
        : "今天還沒有資料。現在不需要催整份回報，晚一點再看即可。",
      cta: late ? "提醒她回報" : null,
      showRecordAction: false,
      missingItems: missing,
    };
  }

  const mealDue: Array<{ item: string; dueHour: number }> = [
    { item: "午餐", dueHour: 13 },
    { item: "晚餐", dueHour: 19 },
    { item: "早餐", dueHour: 10 },
  ];
  const dueMissing = mealDue.find((row) => missing.includes(row.item) && hour >= row.dueHour);
  if (dueMissing && input.report.state === "PARTIAL_REPORT") {
    return {
      priority: "incomplete_item",
      title: `${dueMissing.item}尚未回報`,
      body: describePartial(input, dueMissing.item),
      cta: `提醒完成${dueMissing.item}回報`,
      showRecordAction: false,
      missingItems: missing,
    };
  }

  if (
    input.waterTargetMl != null &&
    input.waterMl != null &&
    input.waterTargetMl > 0 &&
    input.waterMl / input.waterTargetMl < 0.4 &&
    hour >= 16
  ) {
    return {
      priority: "adherence",
      title: "今天水分偏低",
      body: `目前水量紀錄 ${input.waterMl} ml（目標 ${input.waterTargetMl} ml）。先關心執行情況，不要改寫她已回報的數字。`,
      cta: "關心水分執行情況",
      showRecordAction: false,
      missingItems: missing,
    };
  }

  const measurement = input.measurements ?? [];
  if (
    measurement.some((row) => row.state === "INCREASED" || row.state === "DECREASED") &&
    input.interventionLevel === "watch"
  ) {
    return {
      priority: "progress",
      title: "量測有變化，值得看一眼",
      body: "已有可比較的量測。先看事實層，再決定要不要談成果。",
      cta: null,
      showRecordAction: false,
      missingItems: missing,
    };
  }

  if (input.report.state === "COMPLETE_REPORT") {
    return {
      priority: "none",
      title: "今天已完成回報",
      body: "今天不需要追蹤。狀況正常的話，不用主動打擾。",
      cta: null,
      showRecordAction: false,
      missingItems: [],
    };
  }

  return {
    priority: "none",
    title: "今天狀況正常，不需要主動追蹤",
    body: describeWait(input),
    cta: null,
    showRecordAction: false,
    missingItems: missing,
  };
}

function describePartial(
  input: { report: DailyReportSemantics; waterMl?: number | null },
  focusItem: string,
): string {
  const water =
    input.waterMl != null ? `目前水量紀錄 ${input.waterMl} ml。` : "";
  const mealsDone = ["早餐", "午餐", "晚餐"].filter((item) => !input.report.missingRequired.includes(item));
  const done = mealsDone.length ? `${mealsDone.join("、")}已有紀錄。` : "";
  return `${done}${water}${focusItem}還沒有紀錄。先不用催整份回報；若晚一點仍沒有${focusItem}紀錄，再提醒即可。`;
}

function describeWait(input: { report: DailyReportSemantics; waterMl?: number | null }): string {
  const water = input.waterMl != null ? `目前水量紀錄 ${input.waterMl} ml。` : "";
  const missing = input.report.missingRequired.filter((item) => item === "午餐" || item === "晚餐");
  if (missing.length) {
    return `她今天已開始回報。${water}${missing.join("、")}還沒有紀錄，先不用催整份回報。`;
  }
  return `今天已有回報。${water}沒有需要現在介入的事項。`;
}
