import type { CoachingCoachActionRecord } from "@/types/coaching-coach-actions";
import type { CoachingTimelineEvent } from "@/types/coaching-timeline";
import { coachingJourneyDayNumber } from "@/lib/coaching/list-coaching-recent-day-summaries";

/** Keep in sync with TIMELINE_SORT_RANK.coach_action in build-timeline-events.ts */
const COACH_ACTION_SORT_RANK = 50;

const REASON_LABELS: Record<string, string> = {
  recurring_late_sleep: "反覆晚睡",
  sustained_non_reporting: "持續未回報",
  short_non_reporting: "短期漏報",
  customer_voice_recurring_hunger: "反覆飢餓",
  recurring_low_hydration: "水分不穩",
  recurring_meal_execution: "餐點執行",
  outcome_flat_two_period: "量測無改善",
  outcome_worsening: "身體結果惡化",
  execution_outcome_mismatch: "執行與結果落差",
  measurement_due: "建議回測",
  unresolved_coach_action: "待追蹤事項",
  final_intervention_coach_attention: "需教練介入",
  phase2_coach_attention_required: "需教練關心",
};

export function formatCoachActionStatusLabel(status: string): string {
  switch (status) {
    case "resolved":
      return "已解決";
    case "follow_up":
      return "需要追蹤";
    case "acknowledged":
      return "持續觀察";
    case "superseded":
      return "已取代";
    case "open":
    default:
      return "持續觀察";
  }
}

export function formatCoachActionReasonLabel(codes: string[]): string | null {
  for (const code of codes) {
    if (REASON_LABELS[code]) return REASON_LABELS[code]!;
  }
  return codes[0] ?? null;
}

export function buildCoachActionTimelineEvents(input: {
  enrollmentId: string;
  enrollmentStartedAt: string;
  actions: CoachingCoachActionRecord[];
  focusSet?: Set<string>;
  reasonCodes?: string[];
}): CoachingTimelineEvent[] {
  const focusSet = input.focusSet ?? new Set<string>();
  const reasonSet = new Set(input.reasonCodes ?? []);

  return input.actions
    .filter((action) => action.status !== "superseded")
    .map((action) => {
      const logDate = action.relatedLogDate ?? action.createdAt.slice(0, 10);
      const reasonLabel = formatCoachActionReasonLabel(action.relatedReasonCodes);
      const statusLabel = formatCoachActionStatusLabel(action.status);
      const attentionLinked =
        focusSet.has(logDate) ||
        action.relatedReasonCodes.some((code) => reasonSet.has(code));

      return {
        id: `coach_action:${action.id}`,
        enrollmentId: input.enrollmentId,
        type: "coach_action" as const,
        occurredAt: action.createdAt,
        logDate,
        dayNumber: coachingJourneyDayNumber({
          enrollmentStartedAt: input.enrollmentStartedAt,
          logDate,
        }),
        title: reasonLabel ? `處理：${reasonLabel}` : "教練紀錄",
        summary: action.note?.trim() || `狀態：${statusLabel}`,
        evidenceRefs: action.evidenceRefs.length
          ? action.evidenceRefs
          : action.relatedReasonCodes.map((code) => ({
              kind: "ai_signal" as const,
              reasonCode: code,
              displayValue: REASON_LABELS[code] ?? code,
            })),
        sortRank: COACH_ACTION_SORT_RANK,
        attentionLinked,
        payload: {
          actionId: action.id,
          actionType: action.actionType,
          status: action.status,
          statusLabel,
          note: action.note,
          relatedReasonCodes: action.relatedReasonCodes,
          relatedReasonLabel: reasonLabel,
        },
      };
    });
}
