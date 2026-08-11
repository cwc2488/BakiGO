import type { CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";
import type { CoachingDecisionContext, CoachingPriority } from "@/types/coaching-signals";

function formatEvidenceValue(value: string | number | boolean | null): string {
  if (value == null) {
    return "null";
  }
  return String(value);
}

function collectDeterministicEvidence(decision: CoachingDecisionContext): string[] {
  const items: string[] = [];
  const push = (key: string, value: string | number | boolean | null) => {
    const formatted = `${key}=${formatEvidenceValue(value)}`;
    if (!items.includes(formatted)) {
      items.push(formatted);
    }
  };

  for (const priority of decision.priorities) {
    for (const item of priority.evidence) {
      push(item.key, item.value);
    }
  }

  if (decision.recurringIssue) {
    for (const item of decision.recurringIssue.evidence) {
      push(item.key, item.value);
    }
  }

  if (decision.improvedIssue) {
    for (const item of decision.improvedIssue.evidence) {
      push(item.key, item.value);
    }
  }

  if (decision.coachAttention.required) {
    for (const item of decision.coachAttention.evidence) {
      push(item.key, item.value);
    }
  }

  for (const signal of decision.positiveSignals.slice(0, 2)) {
    for (const item of signal.evidence.slice(0, 2)) {
      push(item.key, item.value);
    }
  }

  return items.slice(0, 6);
}

function containsSubject(text: string, subject: string): boolean {
  const tokens = subject
    .split(/[^a-zA-Z0-9\u4e00-\u9fff]+/u)
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) {
    return text.includes(subject);
  }
  return tokens.some((token) => text.includes(token));
}

function alignAdjustmentPriorities(
  aiPriorities: string[],
  priorities: CoachingPriority[],
): string[] {
  if (priorities.length === 0) {
    return [];
  }

  return priorities.map((priority, index) => {
    const aiText = aiPriorities[index]?.trim() ?? "";
    if (aiText && containsSubject(aiText, priority.tomorrowFocusSubject)) {
      return aiText;
    }
    if (aiText && containsSubject(aiText, priority.reason)) {
      return aiText;
    }
    return priority.reason;
  });
}

function alignTomorrowFocus(aiFocus: string, subject: string): string {
  const trimmed = aiFocus.trim();
  if (trimmed && containsSubject(trimmed, subject)) {
    return trimmed;
  }
  return subject;
}

/**
 * System-owned fields are forced from CoachingDecisionContext.
 * AI wording is kept only when it stays on the deterministic subject.
 */
export function applyCoachingDecisionContextToOutput(
  output: CoachingDailyGenerationOutputJson,
  decision: CoachingDecisionContext,
): CoachingDailyGenerationOutputJson {
  const priorities = decision.priorities;
  const adjustment_priorities = alignAdjustmentPriorities(
    output.customer.adjustment_priorities,
    priorities,
  );
  const tomorrow_focus =
    priorities.length === 0
      ? output.customer.tomorrow_focus.trim() || "維持目前節奏"
      : alignTomorrowFocus(output.customer.tomorrow_focus, priorities[0]!.tomorrowFocusSubject);

  return {
    ...output,
    customer: {
      ...output.customer,
      adjustment_priorities,
      tomorrow_focus,
    },
    coach: {
      ...output.coach,
      recurring_issue: decision.recurringIssue?.key ?? null,
      improved_issue: decision.improvedIssue?.key ?? null,
      coach_attention_required: decision.coachAttention.required,
      attention_reason: decision.coachAttention.reason,
      evidence: collectDeterministicEvidence(decision),
      // proposed level remains audit-only; prefer deterministic final level when AI drifts.
      proposed_intervention_level: decision.finalInterventionLevel,
    },
  };
}
