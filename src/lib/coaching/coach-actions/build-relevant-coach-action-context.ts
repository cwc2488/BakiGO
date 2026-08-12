import { COACHING_ACTION_ACK_POLICY } from "@/lib/coaching/attention/coach-attention-policy";
import type {
  CoachingRecentCoachActionMemory,
  CoachingRecentCoachActionMemoryItem,
  CoachingRelevantCoachActionContext,
  CoachingRelevantCoachActionContextItem,
} from "@/types/coaching-coach-actions";
import type { CoachingDecisionContext } from "@/types/coaching-signals";

/**
 * Bridge signal / issue keys ↔ Coach Action relatedReasonCodes.
 * Keep general — do not hardcode situational keywords (加班 / 出差 / …).
 */
const SIGNAL_OR_ISSUE_TO_REASON_CODES: Record<string, readonly string[]> = {
  late_sleep_pattern: ["recurring_late_sleep"],
  late_sleep_today: ["recurring_late_sleep"],
  low_hydration_pattern: ["recurring_low_hydration"],
  hydration_under_plan: ["recurring_low_hydration"],
  meal_execution_pattern: ["recurring_meal_execution"],
  hunger_reported: ["customer_voice_recurring_hunger"],
  customer_voice_hunger: ["customer_voice_recurring_hunger"],
  outcome_flat: ["outcome_flat_two_period"],
  outcome_worsening: ["outcome_worsening"],
  outcome_mixed: ["outcome_worsening", "outcome_flat_two_period"],
};

const ISSUE_LABEL_NOISE =
  /晚睡|睡眠|入睡|作息|飲食|回報|觀察|本週|最近|因為|因|造成|影響|已知|已詢問|已處理|持續|Customer|customer|教練|紀錄|先|再|看看|一下|的|了|與|和|是|很|比較|主要|相關|問題/g;

function expandActiveIssueKeys(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    out.add(key);
    for (const mapped of SIGNAL_OR_ISSUE_TO_REASON_CODES[key] ?? []) {
      out.add(mapped);
    }
  }
  return out;
}

/** Active coaching issues that may need Coach Action context carry-forward. */
export function collectActiveCoachIssueKeys(decisionContext: CoachingDecisionContext): string[] {
  const raw = new Set<string>();
  for (const priority of decisionContext.priorities) {
    raw.add(priority.signalKey);
  }
  if (decisionContext.recurringIssue?.key) {
    raw.add(decisionContext.recurringIssue.key);
  }
  for (const signal of decisionContext.signals) {
    if (signal.severity === "moderate" || signal.severity === "high") {
      raw.add(signal.key);
    }
  }
  if (
    decisionContext.outcomeAssessment.outcomeStatus === "mixed" ||
    decisionContext.outcomeAssessment.outcomeStatus === "worsening" ||
    decisionContext.outcomeAssessment.outcomeStatus === "flat"
  ) {
    raw.add(`outcome_${decisionContext.outcomeAssessment.outcomeStatus}`);
  }
  return [...expandActiveIssueKeys(raw)].sort();
}

function isCurrentlyRelevantStatus(status: CoachingRecentCoachActionMemoryItem["status"]): boolean {
  return status === "open" || status === "acknowledged" || status === "follow_up";
}

function withinRelevanceWindow(createdAt: string, asOfIso: string): boolean {
  const createdMs = Date.parse(createdAt);
  const asOfMs = Date.parse(asOfIso);
  if (Number.isNaN(createdMs) || Number.isNaN(asOfMs)) return false;
  if (asOfMs < createdMs) return false;
  return asOfMs - createdMs <= COACHING_ACTION_ACK_POLICY.suppressDuplicateRecommendationMs;
}

/**
 * Distinctive situational fragments from a Coach note — general token extract,
 * not keyword injection for any specific cause (加班 / 出差 / …).
 */
export function extractDistinctiveCoachContextFragments(note: string): string[] {
  const cleaned = note.replace(ISSUE_LABEL_NOISE, " ").trim();
  const matches = cleaned.match(/[一-鿿]{2,}|[A-Za-z0-9]{3,}/g) ?? [];
  const unique: string[] = [];
  const push = (value: string) => {
    if (value && !unique.includes(value)) unique.push(value);
  };
  for (const match of matches) {
    push(match);
    // Longer runs also expose edge digrams so situational wording can match partial carry-forward.
    if (/^[一-鿿]+$/.test(match) && match.length >= 4) {
      push(match.slice(0, 2));
      push(match.slice(-2));
    }
  }
  return unique;
}

function toRelevantItem(
  action: CoachingRecentCoachActionMemoryItem,
  matchedActiveKeys: string[],
): CoachingRelevantCoachActionContextItem {
  const note = action.note?.trim() ?? "";
  return {
    id: action.id,
    actionType: action.actionType,
    status: action.status,
    note,
    relatedReasonCodes: action.relatedReasonCodes,
    matchedActiveKeys: [...matchedActiveKeys].sort(),
    distinctiveFragments: extractDistinctiveCoachContextFragments(note),
    createdAt: action.createdAt,
    relatedLogDate: action.relatedLogDate,
  };
}

/**
 * Deterministic Relevant Coach Action Context for prompt / quality.
 * Selects only recent + material + reason-relevant + unresolved/currently-relevant notes.
 */
export function buildRelevantCoachActionContext(input: {
  memory: CoachingRecentCoachActionMemory | null | undefined;
  decisionContext: CoachingDecisionContext;
  asOfIso: string;
  limit?: number;
}): CoachingRelevantCoachActionContext {
  const activeIssueKeys = collectActiveCoachIssueKeys(input.decisionContext);
  const activeSet = new Set(activeIssueKeys);
  const limit = input.limit ?? 3;
  const memory = input.memory;

  if (!memory || activeIssueKeys.length === 0) {
    return { activeIssueKeys, knownContexts: [] };
  }

  const candidates = memory.recentActions
    .filter((action) => action.isMaterial)
    .filter((action) => isCurrentlyRelevantStatus(action.status))
    .filter((action) => (action.note?.trim() ?? "").length > 0)
    .filter((action) => withinRelevanceWindow(action.createdAt, input.asOfIso))
    .map((action) => {
      const matched = action.relatedReasonCodes.filter((code) => activeSet.has(code));
      return { action, matched };
    })
    .filter((item) => item.matched.length > 0)
    .sort((a, b) => {
      if (b.matched.length !== a.matched.length) return b.matched.length - a.matched.length;
      return b.action.createdAt.localeCompare(a.action.createdAt);
    })
    .slice(0, limit)
    .map((item) => toRelevantItem(item.action, item.matched));

  return {
    activeIssueKeys,
    knownContexts: candidates,
  };
}

export function relevantCoachActionContextAsOfIso(logDate: string): string {
  return `${logDate}T18:00:00.000+08:00`;
}
