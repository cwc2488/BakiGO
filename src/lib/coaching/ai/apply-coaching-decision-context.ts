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

  for (const observation of decision.mealObservations) {
    push(`${observation.mealSlot}_foods`, observation.observedFoods.join(",") || null);
    for (const signal of observation.signals) {
      push(`${observation.mealSlot}_signal`, signal);
    }
  }

  for (const voice of decision.customerVoice) {
    push("customer_voice", voice.key);
  }

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

  return items.slice(0, 8);
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

function ensureCustomerVoiceResponse(
  current: string | null | undefined,
  decision: CoachingDecisionContext,
): string | null {
  if (decision.customerVoice.length === 0) {
    return current?.trim() || null;
  }
  const trimmed = current?.trim() ?? "";
  if (trimmed.length > 0) {
    return trimmed;
  }
  const hunger = decision.customerVoice.find((item) => item.key === "hunger_reported");
  if (hunger) {
    return "你有說今天還是會餓，這個我有注意到，不用硬忍，我們一起找比較有飽足感的吃法。";
  }
  return `你今天提到「${decision.customerVoice[0]!.rawExcerpt}」，我有收到，我們會一起看怎麼調整。`;
}

function buildDeterministicFollowUps(decision: CoachingDecisionContext): Array<{
  subject: string;
  question: string;
  status: "pending" | "resolved" | "improved";
}> {
  const followUps: Array<{ subject: string; question: string; status: "pending" | "resolved" | "improved" }> = [];

  if (decision.customerVoice.some((item) => item.key === "hunger_reported")) {
    followUps.push({
      subject: "hunger",
      question: "今天還會像昨天一樣容易餓嗎？",
      status: "pending",
    });
  }

  for (const observation of decision.mealObservations) {
    if (observation.followUpQuestion) {
      followUps.push({
        subject: `meal_${observation.mealSlot}`,
        question: observation.followUpQuestion,
        status: "pending",
      });
    }
  }

  return followUps.slice(0, 4);
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

  const followUps =
    output.coach.follow_ups?.length > 0 ? output.coach.follow_ups : buildDeterministicFollowUps(decision);

  const photoReuseFlags = decision.photoReuse.map((item) => ({
    meal_slot: item.mealSlot,
    suspected: item.suspected,
    matched_log_date: item.matchedLogDate,
    method: item.method,
  }));

  return {
    ...output,
    customer: {
      ...output.customer,
      adjustment_priorities,
      tomorrow_focus,
      customer_voice_response: ensureCustomerVoiceResponse(output.customer.customer_voice_response, decision),
      follow_up_for_tomorrow:
        output.customer.follow_up_for_tomorrow?.trim() ||
        followUps[0]?.question ||
        null,
    },
    coach: {
      ...output.coach,
      recurring_issue: decision.recurringIssue?.key ?? null,
      improved_issue: decision.improvedIssue?.key ?? null,
      coach_attention_required: decision.coachAttention.required,
      attention_reason: decision.coachAttention.reason,
      evidence: collectDeterministicEvidence(decision),
      proposed_intervention_level: decision.finalInterventionLevel,
      follow_ups: followUps,
      photo_reuse_flags: photoReuseFlags.length > 0 ? photoReuseFlags : output.coach.photo_reuse_flags ?? [],
    },
  };
}
