import type { CoachingDailyLogDetail } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";
import { resolveDailyReportState, type DailyReportSemantics } from "@/lib/coaching/semantics/daily-report-state";
import { classifyCustomerFreeText } from "@/lib/coaching/semantics/free-text";
import { buildMeasurementComparisons, measurementHeadline } from "@/lib/coaching/semantics/measurement-comparison";
import { buildCoachNextAction } from "@/lib/coaching/semantics/coach-next-action";
import { resolveShareReadiness, shareReadinessCopy } from "@/lib/coaching/semantics/share-readiness";
import { isFeelingClass } from "@/lib/coaching/semantics/free-text";
import type {
  ClassifiedFreeText,
  CoachAiConclusion,
  CoachEvidence,
  CoachNextAction,
  MetricComparison,
  ShareReadinessState,
} from "@/lib/coaching/semantics/types";

export type CoachConsoleViewModel = {
  report: DailyReportSemantics;
  nextAction: CoachNextAction;
  freeText: ClassifiedFreeText | null;
  structuredWaterMl: number | null;
  freeTextWaterMl: number | null;
  waterConflict: boolean;
  measurements: MetricComparison[];
  measurementHeadline: string;
  shareReadiness: ShareReadinessState;
  shareCopy: string;
  aiJudgment: CoachAiConclusion[];
};

export function buildCoachConsoleView(input: {
  dailyLog: CoachingDailyLogDetail | null | undefined;
  baselineRecord?: BodyCompositionRecord | null;
  latestRecord?: BodyCompositionRecord | null;
  measurementStage?: string | null;
  outcomeStatus?: string | null;
  shareSuitableNow?: boolean;
  shareReadiness?: string | null;
  shareRepairExperience?: boolean;
  shareInviteCheckin?: boolean;
  coachAttentionRequired?: boolean;
  attentionReason?: string | null;
  interventionLevel?: string | null;
  dailySummary?: string | null;
  aiEvidence?: string[] | null;
  waterTargetMl?: number | null;
  logDate?: string | null;
  now?: Date;
}): CoachConsoleViewModel {
  const report = resolveDailyReportState(input.dailyLog);
  const freeText = classifyCustomerFreeText(input.dailyLog?.customerNote);
  const structuredWaterMl = input.dailyLog?.waterMl ?? null;
  const freeTextWaterMl = freeText?.mentionedWaterMl ?? null;
  const waterConflict =
    structuredWaterMl != null && freeTextWaterMl != null && structuredWaterMl !== freeTextWaterMl;

  const measurements = buildMeasurementComparisons({
    baselineRecord: input.baselineRecord,
    latestRecord: input.latestRecord,
  });

  const nextAction = buildCoachNextAction({
    report,
    freeText,
    coachAttentionRequired: input.coachAttentionRequired,
    attentionReason: input.attentionReason,
    interventionLevel: input.interventionLevel,
    dailySummary: input.dailySummary,
    bowelCount: input.dailyLog?.bowelMovementCount,
    waterMl: structuredWaterMl,
    waterTargetMl: input.waterTargetMl,
    measurements,
    now: input.now,
  });

  const shareReadiness = resolveShareReadiness({
    measurementStage: input.measurementStage,
    outcomeStatus: input.outcomeStatus,
    suitableNow: input.shareSuitableNow,
    readiness: input.shareReadiness,
    repairExperience: input.shareRepairExperience,
    inviteCheckin: input.shareInviteCheckin,
  });

  const sourceDate = input.logDate ?? input.dailyLog?.logDate ?? null;
  const aiJudgment = buildAiJudgment({
    report,
    freeText,
    nextAction,
    measurements,
    shareReadiness,
    dailySummary: input.dailySummary,
    aiEvidence: input.aiEvidence,
    structuredWaterMl,
    waterConflict,
    freeTextWaterMl,
    sourceDate,
  });

  return {
    report,
    nextAction,
    freeText,
    structuredWaterMl,
    freeTextWaterMl,
    waterConflict,
    measurements,
    measurementHeadline: measurementHeadline(measurements),
    shareReadiness,
    shareCopy: shareReadinessCopy(shareReadiness),
    aiJudgment,
  };
}

function buildAiJudgment(input: {
  report: DailyReportSemantics;
  freeText: ClassifiedFreeText | null;
  nextAction: CoachNextAction;
  measurements: MetricComparison[];
  shareReadiness: ShareReadinessState;
  dailySummary?: string | null;
  aiEvidence?: string[] | null;
  structuredWaterMl: number | null;
  waterConflict: boolean;
  freeTextWaterMl: number | null;
  sourceDate: string | null;
}): CoachAiConclusion[] {
  const items: CoachAiConclusion[] = [];
  const evidence: CoachEvidence[] = [];

  if (input.report.state !== "NO_REPORT") {
    evidence.push({
      type: "structured_daily_log",
      summary: input.report.coachStatusLine,
      sourceDate: input.sourceDate,
    });
  }
  if (input.structuredWaterMl != null) {
    evidence.push({
      type: "structured_daily_log",
      summary: `結構化水分 ${input.structuredWaterMl} ml`,
      sourceDate: input.sourceDate,
    });
  }
  if (input.freeText) {
    evidence.push({
      type: "customer_free_text",
      summary: `顧客原文：「${input.freeText.text}」`,
      sourceDate: input.sourceDate,
      rawExcerpt: input.freeText.text,
    });
  }

  items.push({
    conclusion:
      input.nextAction.priority === "none"
        ? "目前不需要主動介入。"
        : `建議下一步：${input.nextAction.title}`,
    confidence: input.nextAction.priority === "none" || input.nextAction.priority === "incomplete_item" ? "high" : "medium",
    evidence,
  });

  if (input.waterConflict) {
    items.push({
      conclusion: `顧客提到「再喝了${input.freeTextWaterMl}的水」，但結構化水分仍是 ${input.structuredWaterMl} ml。以結構化紀錄為準，原文另外保留。`,
      confidence: "high",
      evidence: [
        {
          type: "structured_daily_log",
          summary: `結構化水分 ${input.structuredWaterMl} ml`,
          sourceDate: input.sourceDate,
        },
        {
          type: "customer_free_text",
          summary: input.freeText?.text ?? "",
          sourceDate: input.sourceDate,
          rawExcerpt: input.freeText?.text,
        },
      ],
    });
  }

  const insufficient = input.measurements.every((row) => row.state === "INSUFFICIENT_DATA");
  items.push({
    conclusion: insufficient
      ? "目前只有起始量測，還不能判斷體重趨勢。"
      : "已有可比較的量測，趨勢請看事實數字，不要把單一變化講成必然成果。",
    confidence: insufficient ? "high" : "medium",
    evidence: input.measurements.map((row) => ({
      type: "measurement" as const,
      summary: row.displayLine,
      sourceDate: input.sourceDate,
    })),
  });

  items.push({
    conclusion:
      input.shareReadiness === "NOT_ENOUGH_DATA"
        ? "成果分享資料還不足，等待下一次量測。這不是負面判斷。"
        : input.shareReadiness === "READY"
          ? "量測與體驗訊號足以考慮談成果分享。"
          : input.shareReadiness === "POSSIBLE_SIGNAL"
            ? "可能出現成果訊號，但還不到可以強推分享的程度。"
            : "目前不適合成果分享；這是依證據判斷，不是因為缺少資料。",
    confidence: input.shareReadiness === "NOT_ENOUGH_DATA" || input.shareReadiness === "READY" ? "high" : "medium",
    evidence: [
      {
        type: "measurement",
        summary: `分享狀態 ${input.shareReadiness}`,
        sourceDate: input.sourceDate,
      },
    ],
  });

  if (input.freeText && !isFeelingClass(input.freeText.class)) {
    items.push({
      conclusion:
        input.freeText.class === "QUESTION"
          ? "這是提問，請當問題處理。"
          : `這段文字目前判斷為${input.freeText.displayLabel ?? "原始紀錄"}，不要把它自動當成心情或感受。`,
      confidence: input.freeText.confidence,
      evidence: [
        {
          type: "customer_free_text",
          summary: `顧客提到：「${input.freeText.text}」`,
          sourceDate: input.sourceDate,
          rawExcerpt: input.freeText.text,
        },
      ],
    });
  }

  if (input.dailySummary?.trim()) {
    items.push({
      conclusion: input.dailySummary.trim(),
      confidence: "low",
      evidence: (input.aiEvidence ?? [])
        .filter((line) => line.trim())
        .slice(0, 4)
        .map((line) => ({
          type: "historical_pattern" as const,
          summary: line,
          sourceDate: input.sourceDate,
        })),
    });
  }

  return items;
}
