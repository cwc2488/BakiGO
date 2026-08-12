import type {
  CoachingAttentionEvidence,
  CoachingAttentionAssessment,
  CoachingRecommendedActionType,
} from "@/types/coaching-attention";

const ACTION_LABELS: Record<CoachingRecommendedActionType, string> = {
  contact_for_non_reporting: "主動聯繫，確認是否需要協助回報。",
  ask_late_sleep_reason: "先了解最近晚睡原因，目前不需要調整飲食策略。",
  review_hunger_pattern: "回顧近期飢餓回報，確認是否需要調整執行節奏。",
  review_execution_and_outcome: "對照執行與身體結果，決定下一步是否調整重點。",
  schedule_retest: "建議安排下一次身體量測，完成後才能進一步判斷變化。",
  follow_up_unresolved_action: "優先處理需要教練介入的事項。",
  acknowledge_positive_progress: "可給予正向肯定，維持目前節奏。",
  continue_observe: "先持續觀察，暫時不需要改變策略。",
  continue_observe_known_context: "已知近期狀況，先持續觀察，不必重複追問相同問題。",
};

export function formatRecommendedActionLabel(
  actionType: CoachingRecommendedActionType | null,
): string | null {
  if (!actionType) return null;
  return ACTION_LABELS[actionType] ?? null;
}

export function formatAttentionEvidenceSummary(assessment: CoachingAttentionAssessment): string | null {
  const late = assessment.evidence.find((item) => item.type === "late_sleep");
  if (late) {
    const days = numberFromEvidence(late, "late_sleep_days") ?? numberFromEvidence(late, "after_midnight_days");
    if (days != null && days > 0) {
      return `最近觀察窗內有 ${days} 天晚睡相關紀錄。`;
    }
    if (typeof late.value === "number" && late.value > 0) {
      return `最近晚睡頻率增加（約 ${late.value} 天）。`;
    }
  }

  const nonReporting = assessment.evidence.find((item) => item.type === "non_reporting");
  if (nonReporting && assessment.consecutiveMissedCompletedDays >= 2) {
    return `已連續 ${assessment.consecutiveMissedCompletedDays} 天未完成回報。`;
  }

  const hunger = assessment.evidence.find((item) => item.type === "customer_voice");
  if (hunger) {
    const count = numberFromEvidence(hunger, "hunger_occurrence_count");
    if (count != null) {
      return `近期有 ${count} 次飢餓相關回報。`;
    }
  }

  const measurement = assessment.evidence.find((item) => item.type === "measurement");
  if (measurement && assessment.measurementReminder) {
    const days = numberFromEvidence(measurement, "days_since_latest_measurement");
    if (days != null) {
      return `距離上次量測已 ${days} 天。`;
    }
  }

  const body = assessment.evidence.find((item) => item.type === "body_outcome");
  if (body && assessment.reasonCodes.includes("outcome_flat_two_period")) {
    return "連續兩段量測結果未見改善。";
  }
  if (body && assessment.reasonCodes.includes("outcome_worsening")) {
    return "身體結果出現需要關注的變化。";
  }

  return null;
}

function numberFromEvidence(block: CoachingAttentionEvidence, key: string): number | null {
  const item = block.items.find((entry) => entry.key === key);
  if (typeof item?.value === "number") return item.value;
  if (typeof item?.value === "string" && /^\d+$/.test(item.value)) return Number(item.value);
  return null;
}

export function formatOutcomeStatusLabel(status: string | null | undefined): string | null {
  switch (status) {
    case "improving":
      return "Improving";
    case "mixed":
      return "Mixed";
    case "flat":
      return "Flat";
    case "worsening":
      return "Worsening";
    case "not_yet_measurable":
      return "持續累積中";
    case "insufficient_data":
      return "資料不足";
    default:
      return null;
  }
}

export function formatCommandCenterSectionLabel(
  section: CoachingAttentionAssessment["commandCenterSection"],
): string {
  switch (section) {
    case "needs_attention":
      return "需要處理";
    case "watch":
      return "持續觀察";
    case "measurement_due":
      return "建議安排回測";
    case "positive_progress":
      return "進展良好";
    case "routine":
    default:
      return "陪跑中";
  }
}
