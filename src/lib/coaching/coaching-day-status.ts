import type { CoachingAiOutputStatus } from "@/types/coaching-ai";
import type { CoachingRelativeDayKey } from "@/lib/coaching/coaching-time";

export type CoachingDayUiStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "ai_analyzing"
  | "ai_ready"
  | "ai_unavailable";

export const COACHING_DAY_UI_STATUS_LABELS: Record<CoachingDayUiStatus, string> = {
  not_started: "未回報",
  draft: "草稿",
  submitted: "已送出",
  ai_analyzing: "AI 分析中",
  ai_ready: "AI 已完成",
  ai_unavailable: "AI 暫時無法生成",
};

export type CoachingRecentDaySummary = {
  logDate: string;
  relativeKey: CoachingRelativeDayKey | null;
  relativeLabel: string;
  shortDate: string;
  status: CoachingDayUiStatus;
  statusLabel: string;
  submittedAt: string | null;
  hasLog: boolean;
  /** 1-based day in 90-day coaching journey when enrollment start is known. */
  dayNumber: number | null;
  /** Customer-safe nutrition label from AI output when available. */
  nutritionLabel: string | null;
  /** Most important focus for the day (tomorrow_focus or top priority). */
  focusSummary: string | null;
};

export function mapCoachingDayUiStatus(input: {
  hasLog: boolean;
  submittedAt: string | null | undefined;
  aiStatus: CoachingAiOutputStatus | "missing" | null | undefined;
}): CoachingDayUiStatus {
  if (!input.hasLog) {
    return "not_started";
  }
  if (!input.submittedAt) {
    return "draft";
  }

  const ai = input.aiStatus ?? "missing";
  if (ai === "pending" || ai === "processing") {
    return "ai_analyzing";
  }
  if (ai === "completed") {
    return "ai_ready";
  }
  if (ai === "failed") {
    return "ai_unavailable";
  }
  return "submitted";
}
