/**
 * Coaching workbench / detail presentation — UI only.
 * Does not change Attention / Outcome / Growth / Directive / bowel authority.
 */

import type {
  CoachingAttentionReasonCode,
  CoachingCommandCenterCard,
  CoachingRecommendedActionType,
} from "@/types/coaching-attention";
import type { CoachingDailyLogDetail } from "@/types/coaching";
import { isMealReported } from "@/lib/coaching/coaching-completion";
import { formatSleepTimeRange } from "@/lib/coaching/coaching-sleep";
import { formatOutcomeStatusLabel } from "@/lib/coaching/presentation/coaching-ui-copy";
import { assessBowelMovementSignal } from "@/lib/coaching/ai/bowel-movement-signal";

/** Human labels — never expose pending/processing/completed enums. */
export type CoachTodayReportState = "not_reported" | "partial" | "organizing" | "ready";

export const COACH_TODAY_REPORT_LABELS: Record<CoachTodayReportState, string> = {
  not_reported: "○ 今天尚未回報",
  partial: "◑ 今天已開始回報",
  organizing: "⏳ 正在整理今天的回報",
  ready: "✓ 今日已完成",
};

export const COACH_TODAY_REPORT_SHORT: Record<CoachTodayReportState, string> = {
  not_reported: "○ 尚未回報",
  partial: "◑ 已開始回報",
  organizing: "⏳ 正在整理",
  ready: "✓ 已完成",
};

/** Detail Layer 4 stays collapsed by default (Growth / Timeline / history deferred). */
export const DETAIL_MORE_DEFAULT_OPEN = false;

export const DETAIL_DEFERRED_PANEL_IDS = [
  "directive",
  "coach_actions",
  "growth",
  "history",
  "measurements",
  "timeline",
  "settings",
] as const;

const WHAT_HAPPENED_BY_CODE: Partial<Record<CoachingAttentionReasonCode, string>> = {
  final_intervention_coach_attention: "今天需要你特別關心一下",
  phase2_coach_attention_required: "今天需要你特別關心一下",
  sustained_non_reporting: "已經連續好幾天沒有回報",
  short_non_reporting: "最近幾天有漏報",
  today_not_yet_reported: "今天還沒回報",
  recurring_late_sleep: "最近幾天比較晚睡",
  recurring_low_hydration: "最近喝水比較不穩定",
  recurring_meal_execution: "最近飲食執行比較不穩定",
  customer_voice_recurring_hunger: "最近常提到比較餓",
  outcome_flat_two_period: "最近兩次量測變化還不明顯",
  outcome_worsening: "最近身體數據需要多留意",
  execution_outcome_mismatch: "執行不錯，但身體變化還不明顯",
  measurement_due: "到了建議重新量測的時間",
  unresolved_coach_action: "還有先前說好要追蹤的事",
  positive_body_outcome: "最近身體變化不錯",
  stable_execution: "最近執行很穩定",
  final_intervention_watch: "建議先持續觀察",
};

const INTERNAL_COPY_PATTERNS = [
  /\bCustomer\b/i,
  /\bOutcome\b/i,
  /\bAttention\b/i,
  /\bIntervention\b/i,
  /\bGrowth\b/i,
  /\bEvidence\b/i,
  /\bDirective\b/i,
  /\bDeterministic\b/i,
  /\bbaseline\b/i,
  /\bfingerprint\b/i,
  /\breasonCodes?\b/i,
  /\brankScore\b/i,
  /\bmeasurement_stage\b/i,
  /\bcoach_attention\b/i,
  /\bpending\b/i,
  /\bprocessing\b/i,
];

export function containsInternalCoachTerminology(text: string): boolean {
  return INTERNAL_COPY_PATTERNS.some((pattern) => pattern.test(text));
}

export function humanizeAttentionWhatHappened(input: {
  reasonCodes: CoachingAttentionReasonCode[];
  primaryReason: string | null;
  evidenceSummary: string | null;
}): string {
  for (const code of input.reasonCodes) {
    const mapped = WHAT_HAPPENED_BY_CODE[code];
    if (mapped) return mapped;
  }
  const fallback = input.evidenceSummary?.trim() || input.primaryReason?.trim() || "今天有狀況需要你看一下";
  if (containsInternalCoachTerminology(fallback)) {
    return "今天有狀況需要你看一下";
  }
  return fallback;
}

export function humanizeAttentionNextStep(input: {
  recommendedActionLabel: string | null;
  recommendedActionType: CoachingRecommendedActionType | null;
}): string {
  const label = input.recommendedActionLabel?.trim();
  if (label && !containsInternalCoachTerminology(label)) {
    // Soften leading verbs for card second line
    if (label.startsWith("主動聯繫")) return "→ 提醒她今天完成回報";
    if (label.startsWith("先了解最近晚睡")) return "→ 問問最近是不是比較晚休息";
    if (label.startsWith("建議安排下一次身體量測") || label.startsWith("建議安排下一次")) {
      return "→ 安排下一次量測";
    }
    return `→ ${label.replace(/。$/, "")}`;
  }
  switch (input.recommendedActionType) {
    case "contact_for_non_reporting":
      return "→ 提醒她今天完成回報";
    case "ask_late_sleep_reason":
      return "→ 問問最近是不是比較晚休息";
    case "schedule_retest":
      return "→ 安排下一次量測";
    case "review_hunger_pattern":
      return "→ 關心一下最近是不是比較容易餓";
    case "review_execution_and_outcome":
      return "→ 對照看執行與身體變化";
    case "follow_up_unresolved_action":
      return "→ 先處理先前說好要追蹤的事";
    case "acknowledge_positive_progress":
      return "→ 給予正向肯定，維持目前節奏";
    case "continue_observe":
    case "continue_observe_known_context":
      return "→ 先持續觀察即可";
    default:
      return "→ 查看今天的回報";
  }
}

export function resolveCoachTodayReportState(input: {
  todaySubmitted: boolean;
  todayAiStatus: string | null | undefined;
  dailyReportState?: "NO_REPORT" | "PARTIAL_REPORT" | "COMPLETE_REPORT";
}): CoachTodayReportState {
  if (input.dailyReportState === "NO_REPORT") return "not_reported";
  if (input.dailyReportState === "PARTIAL_REPORT") return "partial";
  if (input.dailyReportState === "COMPLETE_REPORT") {
    const status = input.todayAiStatus ?? null;
    if (status === "pending" || status === "processing") return "organizing";
    return "ready";
  }
  if (!input.todaySubmitted) return "not_reported";
  const status = input.todayAiStatus ?? null;
  if (status === "completed") return "ready";
  if (status === "failed") return "ready";
  return "organizing";
}

export type WorkbenchUrgentCard = {
  enrollmentId: string;
  customerDisplayName: string;
  whatHappened: string;
  nextStep: string;
  detailHref: string;
};

/** Urgent = needs_attention + watch + measurement_due (not routine/positive). */
export function buildWorkbenchUrgentCards(cards: CoachingCommandCenterCard[]): WorkbenchUrgentCard[] {
  const urgent = cards.filter((card) => {
    const section = card.assessment.commandCenterSection;
    return section === "needs_attention" || section === "watch" || section === "measurement_due";
  });
  return urgent.map((card) => ({
    enrollmentId: card.enrollmentId,
    customerDisplayName: card.customerDisplayName,
    whatHappened: humanizeAttentionWhatHappened({
      reasonCodes: card.assessment.reasonCodes,
      primaryReason: card.assessment.primaryReason,
      evidenceSummary: card.evidenceSummary,
    }),
    nextStep: humanizeAttentionNextStep({
      recommendedActionLabel: card.recommendedActionLabel,
      recommendedActionType: card.assessment.recommendedActionType,
    }),
    detailHref: card.detailHref,
  }));
}

export type WorkbenchTodaySummary = {
  reportedCount: number;
  organizingCount: number;
  notReportedCount: number;
};

export function buildWorkbenchTodaySummary(
  cards: Array<Pick<CoachingCommandCenterCard, "todaySubmitted" | "todayAiStatus">>,
): WorkbenchTodaySummary {
  let reportedCount = 0;
  let organizingCount = 0;
  let notReportedCount = 0;
  for (const card of cards) {
    const state = resolveCoachTodayReportState({
      todaySubmitted: Boolean(card.todaySubmitted),
      todayAiStatus: card.todayAiStatus,
    });
    if (state === "not_reported") notReportedCount += 1;
    else if (state === "partial") reportedCount += 1;
    else if (state === "organizing") {
      organizingCount += 1;
      reportedCount += 1;
    } else {
      reportedCount += 1;
    }
  }
  return { reportedCount, organizingCount, notReportedCount };
}

export type DetailTodayScanRow = { label: string; value: string };

export function buildDetailTodayScanRows(dailyLog: CoachingDailyLogDetail | null | undefined): DetailTodayScanRow[] {
  if (!dailyLog?.id) {
    return [
      { label: "早餐", value: "—" },
      { label: "午餐", value: "—" },
      { label: "晚餐", value: "—" },
      { label: "喝水", value: "—" },
      { label: "睡眠", value: "—" },
      { label: "運動", value: "—" },
      { label: "排便", value: "—" },
    ];
  }
  const meal = (slot: "breakfast" | "lunch" | "dinner") => {
    const entry = dailyLog.meals.find((item) => item.mealSlot === slot);
    return isMealReported(entry) ? "✓" : "—";
  };
  const sleep =
    dailyLog.sleepDuration?.trim() ||
    (dailyLog.sleepBedtime && dailyLog.sleepWakeTime
      ? formatSleepTimeRange(dailyLog.sleepBedtime, dailyLog.sleepWakeTime)
      : null);
  return [
    { label: "早餐", value: meal("breakfast") },
    { label: "午餐", value: meal("lunch") },
    { label: "晚餐", value: meal("dinner") },
    {
      label: "喝水",
      value: dailyLog.waterMl != null ? `${Math.max(0, Math.floor(dailyLog.waterMl))} ml` : "—",
    },
    { label: "睡眠", value: sleep?.trim() || "—" },
    { label: "運動", value: dailyLog.exerciseNote?.trim() || "—" },
    {
      label: "排便",
      value:
        dailyLog.bowelMovementCount != null
          ? `${Math.max(0, Math.floor(dailyLog.bowelMovementCount))} 次`
          : "—",
    },
  ];
}

export type DetailActionCard = {
  title: string;
  body: string;
  suggestion: string | null;
  secondaryNote: string | null;
  showRecordAction: boolean;
};

/**
 * Single Layer-2 action card. Precedence via existing Attention/AI flags —
 * bowel/directive only as secondary notes (never mutate Attention).
 */
export function buildDetailActionCard(input: {
  submitted: boolean;
  aiStatus: string | null | undefined;
  coachAttentionRequired: boolean;
  attentionReason: string | null | undefined;
  dailySummary: string | null | undefined;
  interventionLevel: string | null | undefined;
  bowelCount: number | null | undefined;
  /** Presentation-only directive hint; does not change Attention. */
  directiveSecondaryNote?: string | null;
  hasMeaningfulReport?: boolean;
  missingItems?: string[];
}): DetailActionCard {
  const bowel = assessBowelMovementSignal({ todayCount: input.bowelCount ?? null });
  const bowelNote =
    bowel.level === "elevated_today" || bowel.level === "repeated_elevated"
      ? bowel.coachCopy || bowel.customerCopy
      : null;

  if (input.coachAttentionRequired || input.interventionLevel === "coach_attention") {
    const body =
      (input.attentionReason && !containsInternalCoachTerminology(input.attentionReason)
        ? input.attentionReason.trim()
        : null) ||
      (input.dailySummary && !containsInternalCoachTerminology(input.dailySummary)
        ? input.dailySummary.trim()
        : null) ||
      "今天需要你特別關心一下這位顧客。";
    return {
      title: "今天建議關心一下",
      body,
      suggestion: "可以先問候她今天的狀況，再決定要不要調整安排。",
      secondaryNote: bowelNote || input.directiveSecondaryNote || null,
      showRecordAction: true,
    };
  }

  if (input.interventionLevel === "watch" || (input.dailySummary && input.submitted)) {
    const body =
      (input.dailySummary && !containsInternalCoachTerminology(input.dailySummary)
        ? input.dailySummary.trim()
        : null) || "今天有一些值得留意的地方，先關心一下即可。";
    return {
      title: "今天可以關心一下",
      body,
      suggestion: null,
      secondaryNote: bowelNote || input.directiveSecondaryNote || null,
      showRecordAction: true,
    };
  }

  if (input.submitted && (input.aiStatus === "pending" || input.aiStatus === "processing" || !input.aiStatus)) {
    return {
      title: "進階分析正在整理中",
      body: "今日回報已收到。下面的今日資料可以先看；進階建議稍後會自動補上。",
      suggestion: null,
      secondaryNote: bowelNote || input.directiveSecondaryNote || null,
      showRecordAction: Boolean(bowelNote || input.directiveSecondaryNote),
    };
  }

  if (!input.submitted && input.hasMeaningfulReport) {
    const missing = (input.missingItems ?? []).filter(Boolean);
    return {
      title: "今天已開始回報",
      body: missing.length
        ? `尚有項目未完成：${missing.join("、")}。先不用催整份回報。`
        : "今天已開始回報，尚有項目未完成。先不用催整份回報。",
      suggestion: missing[0] ? `→ 若晚一點仍沒有${missing[0]}紀錄，再提醒即可` : null,
      secondaryNote: bowelNote || input.directiveSecondaryNote || null,
      showRecordAction: false,
    };
  }

  if (!input.submitted) {
    return {
      title: "今天還沒回報",
      body: "可以提醒她完成今天的回報。",
      suggestion: "→ 提醒她今天完成回報",
      secondaryNote: null,
      showRecordAction: false,
    };
  }

  return {
    title: "目前狀況穩定",
    body: "今天沒有需要特別處理的事情，持續陪跑即可。",
    suggestion: null,
    secondaryNote: bowelNote || input.directiveSecondaryNote || null,
    showRecordAction: Boolean(bowelNote),
  };
}

export function formatEnrollmentDateRange(startedAt: string, plannedEndAt: string | null | undefined): string {
  const start = startedAt.slice(0, 10).replace(/-/g, "/");
  const end = plannedEndAt ? plannedEndAt.slice(0, 10).replace(/-/g, "/") : "—";
  return `${start} ～ ${end}`;
}

export function humanizeOutcomeConclusion(outcomeStatus: string | null | undefined): string {
  if (
    !outcomeStatus ||
    outcomeStatus === "not_yet_measurable" ||
    outcomeStatus === "insufficient_data" ||
    outcomeStatus === "baseline_only"
  ) {
    return "目前資料還不夠，下一次量測後會更容易看出變化。";
  }
  const label = formatOutcomeStatusLabel(outcomeStatus);
  if (
    containsInternalCoachTerminology(label) ||
    label === "狀態更新中" ||
    label.includes("not_yet") ||
    label.includes("baseline")
  ) {
    return "目前資料還不夠，下一次量測後會更容易看出變化。";
  }
  if (label === "進展良好") return "系統結論：「目前進展良好」";
  return `系統結論：「目前${label}」`;
}
