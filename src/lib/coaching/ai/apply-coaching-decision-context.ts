import {
  dailyNutritionAssessmentCustomerLabel,
} from "@/lib/coaching/ai/assess-daily-nutrition";
import { applyCoachingOutputQualityGuard } from "@/lib/coaching/ai/apply-coaching-output-quality-guard";
import { proseAlreadyCovers } from "@/lib/coaching/ai/coaching-text-dedup";
import { applyMealFollowUpBudgetToOutput } from "@/lib/coaching/ai/meal-follow-up-budget";
import type { CoachingDailyGenerationOutputJson, CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext, CoachingPriority } from "@/types/coaching-signals";
import type { CoachingRelevantCoachActionContext } from "@/types/coaching-coach-actions";
import {
  buildRelevantCoachActionContext,
  relevantCoachActionContextAsOfIso,
} from "@/lib/coaching/coach-actions/build-relevant-coach-action-context";

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

  push("daily_nutrition_level", decision.dailyNutritionAssessment.level);

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

const BASELINE_ONLY_BODY_CLAIM_PATTERN =
  /(最近).{0,12}(體脂|體重|肌肉|內臟脂肪).{0,12}(下降|上升|改善|惡化|變差|沒有變|卡住)|(身體正在|數據).{0,8}(改善|惡化|變差|卡住)|所以你的(體脂|體重)/u;

function sanitizeBaselineOnlyBodyClaims(
  text: string,
  decision: CoachingDecisionContext,
): string {
  if (decision.goalContext.measurementStage !== "baseline_only") {
    return text;
  }
  if (!BASELINE_ONLY_BODY_CLAIM_PATTERN.test(text)) {
    return text;
  }
  const goal = decision.goalContext.goalLabel || "陪跑目標";
  return `以你目前的${goal}來看，先把今天的執行節奏顧好；身體變化等下一次回測再一起看。`;
}

function shouldSurfaceDeterministicOutcome(decision: CoachingDecisionContext): boolean {
  const stage = decision.goalContext.measurementStage;
  if (stage !== "comparison_available" && stage !== "trend_available") {
    return false;
  }
  return ["improving", "mixed", "flat", "worsening"].includes(
    decision.outcomeAssessment.outcomeStatus,
  );
}

/** True when customer prose already conveys the deterministic outcome in natural language. */
function customerTextReflectsOutcome(
  text: string,
  decision: CoachingDecisionContext,
): boolean {
  const status = decision.outcomeAssessment.outcomeStatus;
  const summary = decision.outcomeAssessment.customerSummary;

  switch (status) {
    case "improving":
      if (/重組/.test(summary)) {
        return (
          /重組|身體重組/.test(text) ||
          (/(體脂).{0,10}(下降|降低)/.test(text) &&
            /(肌肉).{0,10}(上升|增加|維持)/.test(text))
        );
      }
      return (
        /(體重|體脂).{0,12}(下降|降低)|(下降|降低).{0,12}(體重|體脂)/.test(text) &&
        /肌肉/.test(text)
      );
    case "mixed":
      return (
        /肌肉/.test(text) &&
        /(流失|下降)/.test(text) &&
        /(不能只|不是單純|別只|減脂成功)/.test(text)
      );
    case "flat":
      return (
        /(變化不大|沒有明顯變化|持平|先觀察)/.test(text) &&
        /(身體|數據|回測|體重|體脂)/.test(text)
      );
    case "worsening":
      return /(需要調整|未朝|還沒朝|結果.{0,8}(不理想|偏離)|方向.{0,6}偏)/.test(text);
    default:
      return true;
  }
}

/**
 * DecisionContext authority: when comparison/trend evidence exists, customer-facing
 * today_feedback must surface outcomeAssessment.customerSummary (no new schema field).
 */
function ensureCustomerOutcomeWording(
  todayFeedback: string,
  decision: CoachingDecisionContext,
  otherCustomerText: string,
): string {
  if (!shouldSurfaceDeterministicOutcome(decision)) {
    return todayFeedback;
  }

  const combined = `${otherCustomerText} ${todayFeedback}`;
  if (customerTextReflectsOutcome(combined, decision)) {
    return todayFeedback;
  }

  const summary = decision.outcomeAssessment.customerSummary.trim();
  if (!summary) {
    return todayFeedback;
  }

  const normalized = summary.endsWith("。") ? summary : `${summary}。`;
  const trimmed = todayFeedback.trim();
  if (!trimmed) {
    return normalized;
  }
  if (proseAlreadyCovers(trimmed, normalized)) {
    return trimmed;
  }
  return `${normalized}${trimmed}`;
}

function appendOutcomeEvidence(items: string[], decision: CoachingDecisionContext): string[] {
  const outcomeItems = [
    `measurement_stage=${formatEvidenceValue(decision.goalContext.measurementStage)}`,
    `outcome_status=${formatEvidenceValue(decision.outcomeAssessment.outcomeStatus)}`,
    `trend_status=${formatEvidenceValue(decision.outcomeAssessment.trendStatus)}`,
    `goal_type=${formatEvidenceValue(decision.goalContext.goalType)}`,
  ];
  const merged = [...outcomeItems];
  for (const item of items) {
    if (!merged.includes(item)) merged.push(item);
  }
  return merged.slice(0, 8);
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

  const budget = decision.mealFollowUpBudget;
  if (budget.allowCustomerMealClarification) {
    if (budget.consolidatedQuestion) {
      followUps.push({
        subject: "meal_clarification",
        question: budget.consolidatedQuestion,
        status: "pending",
      });
    } else if (budget.selectedMealSlot && budget.selectedQuestion) {
      followUps.push({
        subject: `meal_${budget.selectedMealSlot}`,
        question: budget.selectedQuestion,
        status: "pending",
      });
    }
  }

  return followUps.slice(0, 4);
}


function flattenForKnownContext(output: CoachingDailyGenerationOutputJson): string {
  return [
    output.coach.daily_summary,
    output.coach.attention_reason ?? "",
    ...(output.coach.evidence ?? []),
    output.customer.today_feedback,
    output.customer.tomorrow_focus,
    output.customer.follow_up_for_tomorrow ?? "",
    ...output.customer.adjustment_priorities,
    output.customer.lifestyle_feedback.sleep ?? "",
  ].join("\n");
}

/**
 * System-owned Known Context carry-forward.
 * Reuses Coach Action note text (general) — never injects scenario-specific keywords.
 */
export function ensureRelevantCoachActionContextWording(
  output: CoachingDailyGenerationOutputJson,
  relevant: CoachingRelevantCoachActionContext,
): CoachingDailyGenerationOutputJson {
  if (relevant.knownContexts.length === 0) {
    return output;
  }

  const blob = flattenForKnownContext(output);
  const missing = relevant.knownContexts.filter((item) => {
    if (item.distinctiveFragments.length === 0) return false;
    return !item.distinctiveFragments.some((fragment) => blob.includes(fragment));
  });
  if (missing.length === 0) {
    return output;
  }

  const knownSentence = missing
    .map((item) => item.note.trim().replace(/[。．.]+$/u, ""))
    .filter(Boolean)
    .join("；");
  if (!knownSentence) {
    return output;
  }

  const coachCarry = `已知：${knownSentence}。後續以延續觀察為主，不再重新確認同一原因。`;
  const customerCarry = `${knownSentence}，這段時間先觀察能不能把節奏稍微往前。`;
  const todayFeedback = output.customer.today_feedback;
  const sleepText = output.customer.lifestyle_feedback.sleep?.trim() ?? "";
  const coachSummary = output.coach.daily_summary;

  return {
    ...output,
    customer: {
      ...output.customer,
      today_feedback: proseAlreadyCovers(todayFeedback, customerCarry)
        ? todayFeedback
        : `${customerCarry}${todayFeedback}`.trim(),
      lifestyle_feedback: {
        ...output.customer.lifestyle_feedback,
        sleep: sleepText
          ? proseAlreadyCovers(`${todayFeedback} ${sleepText}`, customerCarry)
            ? sleepText
            : `${customerCarry}${sleepText}`
          : proseAlreadyCovers(todayFeedback, customerCarry)
            ? sleepText || null
            : customerCarry,
      },
    },
    coach: {
      ...output.coach,
      daily_summary: proseAlreadyCovers(coachSummary, coachCarry)
        ? coachSummary
        : `${coachCarry}${coachSummary}`.trim(),
    },
  };
}

/**
 * System-owned fields are forced from CoachingDecisionContext.
 * AI wording is kept only when it stays on the deterministic subject.
 */
export function applyCoachingDecisionContextToOutput(
  output: CoachingDailyGenerationOutputJson,
  decision: CoachingDecisionContext,
  options?: { generationInput?: CoachingGenerationInput | null },
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

  const assessment = decision.dailyNutritionAssessment;
  const customerVoiceResponse = sanitizeBaselineOnlyBodyClaims(
    ensureCustomerVoiceResponse(output.customer.customer_voice_response, decision) ?? "",
    decision,
  );
  const todayFeedbackWithOutcome = ensureCustomerOutcomeWording(
    output.customer.today_feedback,
    decision,
    `${output.customer.encouragement} ${output.customer.daily_food_summary ?? ""}`,
  );
  const withSystemFields: CoachingDailyGenerationOutputJson = {
    ...output,
    customer: {
      ...output.customer,
      encouragement: sanitizeBaselineOnlyBodyClaims(output.customer.encouragement, decision),
      today_feedback: sanitizeBaselineOnlyBodyClaims(todayFeedbackWithOutcome, decision),
      adjustment_priorities,
      tomorrow_focus: sanitizeBaselineOnlyBodyClaims(tomorrow_focus, decision),
      customer_voice_response: customerVoiceResponse || null,
      follow_up_for_tomorrow:
        output.customer.follow_up_for_tomorrow?.trim() ||
        followUps[0]?.question ||
        null,
    },
    coach: {
      ...output.coach,
      daily_summary: sanitizeBaselineOnlyBodyClaims(output.coach.daily_summary, decision),
      recurring_issue: decision.recurringIssue?.key ?? null,
      improved_issue: decision.improvedIssue?.key ?? null,
      coach_attention_required: decision.coachAttention.required,
      attention_reason: decision.coachAttention.reason,
      evidence: appendOutcomeEvidence(collectDeterministicEvidence(decision), decision),
      proposed_intervention_level: decision.finalInterventionLevel,
      follow_ups: followUps,
      photo_reuse_flags: photoReuseFlags.length > 0 ? photoReuseFlags : output.coach.photo_reuse_flags ?? [],
      daily_nutrition_assessment: {
        level: assessment.level,
        label: dailyNutritionAssessmentCustomerLabel(assessment.level),
        reasons: assessment.reasons,
        positive_factors: assessment.positiveFactors,
        adjustment_subjects: assessment.adjustmentSubjects,
        confidence: assessment.confidence,
      },
    },
  };

  const withMealBudget = applyMealFollowUpBudgetToOutput(withSystemFields, decision);
  const withBowelAndDirectives = applyBowelAndDirectiveCopy(withMealBudget, decision);
  const generationInput = options?.generationInput ?? null;
  const withKnownContext = generationInput
    ? ensureRelevantCoachActionContextWording(
        withBowelAndDirectives,
        buildRelevantCoachActionContext({
          memory: generationInput.recentCoachActionMemory,
          decisionContext: decision,
          asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
        }),
      )
    : withBowelAndDirectives;
  return applyCoachingOutputQualityGuard(withKnownContext);
}

function applyBowelAndDirectiveCopy(
  output: CoachingDailyGenerationOutputJson,
  decision: CoachingDecisionContext,
): CoachingDailyGenerationOutputJson {
  const bowelCustomer = decision.bowelSignal?.customerCopy?.trim();
  const bowelCoach = decision.bowelSignal?.coachCopy?.trim();
  const directiveCustomerLines = (decision.directiveVerifications ?? [])
    .map((item) => item.customerCopy?.trim())
    .filter((line): line is string => Boolean(line));
  const directiveCoachLines = (decision.directiveVerifications ?? [])
    .filter((item) => item.status !== "ignored")
    .map((item) => item.coachCopy?.trim())
    .filter((line): line is string => Boolean(line));

  if (!bowelCustomer && !bowelCoach && directiveCustomerLines.length === 0 && directiveCoachLines.length === 0) {
    return output;
  }

  const customerExtra = [...directiveCustomerLines, bowelCustomer].filter(Boolean).join(" ");
  const coachExtra = [...directiveCoachLines, bowelCoach].filter(Boolean).join(" ");
  const todayFeedback = output.customer.today_feedback;
  const nextTodayFeedback =
    customerExtra && !proseAlreadyCovers(todayFeedback, customerExtra)
      ? `${customerExtra}${todayFeedback}`.trim()
      : todayFeedback;
  const exerciseText = output.customer.lifestyle_feedback.exercise;
  const nextExercise =
    bowelCustomer && !proseAlreadyCovers(`${nextTodayFeedback} ${exerciseText ?? ""}`, bowelCustomer)
      ? [bowelCustomer, exerciseText].filter(Boolean).join(" ")
      : exerciseText;
  const coachSummary = output.coach.daily_summary;
  const nextCoachSummary =
    coachExtra && !proseAlreadyCovers(coachSummary, coachExtra)
      ? `${coachExtra} ${coachSummary}`.trim()
      : coachSummary;

  return {
    ...output,
    customer: {
      ...output.customer,
      today_feedback: nextTodayFeedback,
      lifestyle_feedback: {
        ...output.customer.lifestyle_feedback,
        exercise: nextExercise,
      },
    },
    coach: {
      ...output.coach,
      daily_summary: nextCoachSummary,
      evidence: [
        ...output.coach.evidence,
        ...(decision.bowelSignal
          ? [`bowel_level=${decision.bowelSignal.level}`, `bowel_count=${decision.bowelSignal.todayCount}`]
          : []),
        ...(decision.directiveVerifications ?? [])
          .filter((item) => item.status !== "ignored")
          .slice(0, 3)
          .map((item) => `directive_${item.mealSlot}=${item.status}`),
      ].slice(0, 12),
    },
  };
}
