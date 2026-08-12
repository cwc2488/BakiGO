import {
  COACHING_COACH_ACTION_MEMORY_LIMIT,
  type CoachingCoachActionRecord,
  type CoachingRecentCoachActionMemory,
  type CoachingRecentCoachActionMemoryItem,
} from "@/types/coaching-coach-actions";

function toMemoryItem(action: CoachingCoachActionRecord): CoachingRecentCoachActionMemoryItem {
  return {
    id: action.id,
    actionType: action.actionType,
    status: action.status,
    note: action.note,
    relatedReasonCodes: action.relatedReasonCodes,
    createdAt: action.createdAt,
    resolvedAt: action.resolvedAt,
    isMaterial: action.isMaterial,
    relatedLogDate: action.relatedLogDate,
  };
}

/**
 * Deterministic Recent Coach Action Memory for GenerationInput / Attention.
 * Token-bounded: newest first, max N items; unresolved follow-ups always preferred.
 */
export function buildRecentCoachActionMemory(
  actions: CoachingCoachActionRecord[],
  options?: { limit?: number },
): CoachingRecentCoachActionMemory {
  const limit = options?.limit ?? COACHING_COACH_ACTION_MEMORY_LIMIT;
  const sorted = [...actions]
    .filter((action) => action.status !== "superseded")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const unresolvedFollowUps = sorted
    .filter((action) => action.status === "follow_up" && action.resolvedAt == null)
    .slice(0, limit)
    .map(toMemoryItem);

  const recentActions = sorted.slice(0, limit).map(toMemoryItem);
  const materialActions = sorted
    .filter((action) => action.isMaterial)
    .slice(0, limit)
    .map(toMemoryItem);

  return {
    recentActions,
    unresolvedFollowUps,
    materialActions,
  };
}

/** Compact text for prompts / quality checks — never dumps full timeline. */
export function summarizeCoachActionMemoryForPrompt(
  memory: CoachingRecentCoachActionMemory | null | undefined,
): string {
  if (!memory || memory.recentActions.length === 0) {
    return "（無近期教練處理紀錄）";
  }
  return memory.recentActions
    .map((action) => {
      const codes = action.relatedReasonCodes.join(",") || "general";
      const note = action.note?.trim() || "（無文字）";
      return `- [${action.createdAt.slice(0, 10)}] ${action.actionType}/${action.status} reasons=${codes} note=${note}`;
    })
    .join("\n");
}
