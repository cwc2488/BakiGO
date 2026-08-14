export const COACHING_DELETE_COPY = {
  action: "刪除紀錄",
  confirmTitle: "確定要刪除這筆陪跑紀錄嗎？",
  confirmBody: "刪除後會從顧客的陪跑時間軸消失，之後也不會再當成最新回報或 AI 依據。",
  cancel: "取消",
  confirm: "刪除紀錄",
  success: "已刪除這筆陪跑紀錄",
  baselineBlocked: "起始量測不可刪除，否則會破壞身體變化比較。",
  measurementBlocked: "量測紀錄不由陪跑時間軸刪除，以免影響身體變化比較。",
} as const;

export type CoachingDeleteUiPhase = "idle" | "confirming" | "deleting";

export type CoachingDeleteUiEvent =
  | { type: "request_delete" }
  | { type: "cancel" }
  | { type: "confirm" }
  | { type: "finished" };

/** First tap only opens confirmation — it never deletes. */
export function reduceCoachingDeleteUi(
  phase: CoachingDeleteUiPhase,
  event: CoachingDeleteUiEvent,
): CoachingDeleteUiPhase {
  if (event.type === "request_delete") {
    return phase === "idle" ? "confirming" : phase;
  }
  if (event.type === "cancel" || event.type === "finished") {
    return "idle";
  }
  if (event.type === "confirm") {
    return phase === "confirming" ? "deleting" : phase;
  }
  return phase;
}

export function firstTapDeletesCoachingRecord(): boolean {
  return false;
}

export type CoachingBaselineDeletionDecision = {
  allowed: boolean;
  policy: "prevent_baseline_deletion";
  reason: string;
};

/**
 * Policy B: prevent baseline (and other body-measurement) deletion from the coaching timeline.
 * Daily-log delete never mutates enrollment.baseline_body_record_id.
 */
export function coachingBaselineDeletionPolicy(input: {
  eventType: "daily_report" | "body_measurement" | "intervention_change" | "coach_action";
  measurementKind?: "baseline" | "comparison" | null;
}): CoachingBaselineDeletionDecision {
  if (input.eventType === "body_measurement") {
    const reason =
      input.measurementKind === "baseline"
        ? COACHING_DELETE_COPY.baselineBlocked
        : COACHING_DELETE_COPY.measurementBlocked;
    return { allowed: false, policy: "prevent_baseline_deletion", reason };
  }
  return {
    allowed: input.eventType === "daily_report",
    policy: "prevent_baseline_deletion",
    reason: input.eventType === "daily_report" ? "daily_report" : "not_a_deletable_coaching_record",
  };
}

export function isActiveCoachingRow(row: { deleted_at?: string | null; deletedAt?: string | null }): boolean {
  return !row.deleted_at && !row.deletedAt;
}

export function latestActiveSubmittedLog<T extends { logDate: string; submittedAt?: string | null; deletedAt?: string | null; deleted_at?: string | null }>(
  logs: T[],
): T | null {
  const active = logs
    .filter((log) => isActiveCoachingRow(log) && Boolean(log.submittedAt))
    .sort((left, right) => right.logDate.localeCompare(left.logDate));
  return active[0] ?? null;
}

export function excludeDeletedAiFromContext<T extends { logDate: string; deletedAt?: string | null; deleted_at?: string | null }>(
  outputs: T[],
  activeLogDates: Iterable<string>,
): T[] {
  const dates = new Set(activeLogDates);
  return outputs.filter((output) => isActiveCoachingRow(output) && dates.has(output.logDate));
}
