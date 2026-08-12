import type { CoachingDailyMealFeedback, CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";
import type {
  CoachingDecisionContext,
  CoachingMealFollowUpBudget,
  CoachingMealObservation,
} from "@/types/coaching-signals";
import {
  mealSlotAllowsShake,
  type CoachingMealPlanContext,
} from "@/lib/coaching/ai/meal-plan-context";
import { normalizeMealObservation } from "@/lib/coaching/ai/normalize-meal-observations";

const PRIMARY_SLOTS = ["breakfast", "lunch", "dinner"] as const;

const SLOT_LABEL: Record<(typeof PRIMARY_SLOTS)[number], string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

const CLARIFICATION_PATTERN =
  /還有沒有搭配|除了.{0,8}還有|還有吃別的|其他東西|其他食物|有沒有搭配/;

export function isClarificationQuestion(question: string | null | undefined): boolean {
  if (!question?.trim()) {
    return false;
  }
  return CLARIFICATION_PATTERN.test(question);
}

function hasShakeEvidence(observation: CoachingMealObservation): boolean {
  return Boolean(
    observation.shakeObserved ||
      observation.signals.includes("shake_dominant") ||
      observation.observedFoods.some((food) => /奶昔|蛋白飲|代餐/.test(food)),
  );
}

/**
 * True only when meal evidence actually shows a shake — never from bare noOtherFoodVisible.
 */
export function isShakeObservation(observation: CoachingMealObservation): boolean {
  return hasShakeEvidence(observation);
}

function questionFamily(question: string): "shake_pairing" | "other" {
  if (/奶昔|代餐|蛋白飲/.test(question) || CLARIFICATION_PATTERN.test(question)) {
    return "shake_pairing";
  }
  return "other";
}

/**
 * Explicit eligibility for customer-facing meal clarification.
 * Prefer 0 questions when answer would not change coaching.
 */
export function isMealClarificationEligible(
  mealObservation: CoachingMealObservation,
  planContext: CoachingMealPlanContext,
  options?: { hungerReported?: boolean },
): boolean {
  const observation = normalizeMealObservation(mealObservation);

  if (options?.hungerReported) {
    return false;
  }

  // Already saw pairing food — never ask "有沒有搭配".
  if (observation.solidFoodObserved === true) {
    return false;
  }

  const hasClarificationAsk = isClarificationQuestion(observation.followUpQuestion);
  const incompleteShake =
    hasShakeEvidence(observation) && observation.noOtherFoodVisible === true;

  if (!hasClarificationAsk && !incompleteShake) {
    return false;
  }

  // Plan-approved shake alone is expected behavior, not a clarification trigger.
  if (hasShakeEvidence(observation) && mealSlotAllowsShake(planContext, observation.mealSlot)) {
    return false;
  }

  // Answer must be able to change coaching: incomplete non-plan shake, or other real uncertainty.
  if (incompleteShake && !mealSlotAllowsShake(planContext, observation.mealSlot)) {
    return true;
  }

  if (hasClarificationAsk && !hasShakeEvidence(observation)) {
    // Non-shake clarification only when observation still has explicit uncertainty.
    return (observation.uncertainties?.length ?? 0) > 0;
  }

  return false;
}

function buildConsolidatedShakeQuestion(slots: Array<(typeof PRIMARY_SLOTS)[number]>): string {
  const labels = slots.map((slot) => SLOT_LABEL[slot]);
  if (labels.length === 1) {
    return `我看到${labels[0]}照片主要看到奶昔，如果還有搭配其他食物，下次一起拍進來，我會更好判斷你的飽足感。`;
  }
  return `我看到${labels.join("和")}照片主要看到奶昔，如果還有搭配其他食物，下次一起拍進來，我會更好判斷你的飽足感。`;
}

/**
 * Assert consolidated / selected shake follow-up text only references meals with shake evidence.
 * Returns null when statement is evidence-backed; otherwise a failure reason.
 */
export function assertCustomerFoodStatementEvidenceBacked(input: {
  statement: string | null | undefined;
  mealObservations: CoachingMealObservation[];
}): string | null {
  const statement = input.statement?.trim();
  if (!statement) {
    return null;
  }

  if (!/奶昔|蛋白飲|代餐/.test(statement)) {
    return null;
  }

  const referencedSlots = PRIMARY_SLOTS.filter((slot) => statement.includes(SLOT_LABEL[slot]));
  if (referencedSlots.length === 0) {
    return null;
  }

  for (const slot of referencedSlots) {
    const observation = input.mealObservations.find((item) => item.mealSlot === slot);
    if (!observation || !hasShakeEvidence(observation)) {
      return `Statement references ${SLOT_LABEL[slot]} as shake without MealObservation shake evidence.`;
    }
  }

  return null;
}

/**
 * Deterministic meal clarification budget for one log_date.
 * Customer-facing meal follow-ups: at most 1; may be 0.
 */
export function buildMealFollowUpBudget(input: {
  mealObservations: CoachingMealObservation[];
  planContext: CoachingMealPlanContext;
  hungerReported?: boolean;
}): CoachingMealFollowUpBudget {
  const normalized = input.mealObservations.map(normalizeMealObservation);

  const eligible = normalized
    .filter((item) =>
      isMealClarificationEligible(item, input.planContext, {
        hungerReported: input.hungerReported,
      }),
    )
    .map((item) => ({
      mealSlot: item.mealSlot,
      question:
        item.followUpQuestion?.trim() ||
        (hasShakeEvidence(item)
          ? `照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？`
          : null),
      family: questionFamily(item.followUpQuestion ?? "奶昔"),
      shake: hasShakeEvidence(item),
    }))
    .filter((item): item is typeof item & { question: string } => Boolean(item.question));

  if (eligible.length === 0) {
    return {
      maxCustomerMealClarifications: 1,
      selectedMealSlot: null,
      selectedQuestion: null,
      suppressedMealSlots: [],
      consolidatedQuestion: null,
      allowCustomerMealClarification: false,
    };
  }

  const shakeEligible = eligible.filter((item) => item.shake && item.family === "shake_pairing");
  if (shakeEligible.length >= 2) {
    const slots = shakeEligible.map((item) => item.mealSlot);
    const consolidatedQuestion = buildConsolidatedShakeQuestion(slots);
    const evidenceError = assertCustomerFoodStatementEvidenceBacked({
      statement: consolidatedQuestion,
      mealObservations: normalized,
    });
    if (evidenceError) {
      // Fall back to single earliest eligible slot rather than inventing food facts.
      const selected = shakeEligible[0]!;
      return {
        maxCustomerMealClarifications: 1,
        selectedMealSlot: selected.mealSlot,
        selectedQuestion: selected.question,
        suppressedMealSlots: eligible
          .filter((item) => item.mealSlot !== selected.mealSlot)
          .map((item) => item.mealSlot),
        consolidatedQuestion: null,
        allowCustomerMealClarification: true,
      };
    }

    return {
      maxCustomerMealClarifications: 1,
      selectedMealSlot: null,
      selectedQuestion: null,
      suppressedMealSlots: eligible.map((item) => item.mealSlot),
      consolidatedQuestion,
      allowCustomerMealClarification: true,
    };
  }

  const selected = eligible[0]!;
  return {
    maxCustomerMealClarifications: 1,
    selectedMealSlot: selected.mealSlot,
    selectedQuestion: selected.question,
    suppressedMealSlots: eligible
      .filter((item) => item.mealSlot !== selected.mealSlot)
      .map((item) => item.mealSlot),
    consolidatedQuestion: null,
    allowCustomerMealClarification: true,
  };
}

function clearMealFollowUp(
  meal: CoachingDailyMealFeedback | null,
): CoachingDailyMealFeedback | null {
  if (!meal) {
    return meal;
  }
  if (!meal.follow_up_question) {
    return meal;
  }
  return { ...meal, follow_up_question: null };
}

function setMealFollowUp(
  meal: CoachingDailyMealFeedback | null,
  question: string,
): CoachingDailyMealFeedback | null {
  if (!meal) {
    return {
      summary: "這餐有回報。",
      good_point: null,
      adjustment: null,
      follow_up_question: question,
    };
  }
  return { ...meal, follow_up_question: question };
}

/** Apply budget to customer meal_feedback + coach follow_ups (deterministic). */
export function applyMealFollowUpBudgetToOutput(
  output: CoachingDailyGenerationOutputJson,
  decision: CoachingDecisionContext,
): CoachingDailyGenerationOutputJson {
  const budget = decision.mealFollowUpBudget;
  const mealFeedback = { ...output.customer.meal_feedback };

  for (const slot of PRIMARY_SLOTS) {
    const current = mealFeedback[slot];
    if (!current) continue;
    if (!isClarificationQuestion(current.follow_up_question) && !current.follow_up_question) {
      continue;
    }
    if (isClarificationQuestion(current.follow_up_question)) {
      mealFeedback[slot] = clearMealFollowUp(current);
    }
  }

  let followUpForTomorrow = output.customer.follow_up_for_tomorrow;

  // Strip any fabricated shake consolidation left in GPT wording before re-applying budget.
  if (
    followUpForTomorrow &&
    assertCustomerFoodStatementEvidenceBacked({
      statement: followUpForTomorrow,
      mealObservations: decision.mealObservations,
    })
  ) {
    followUpForTomorrow = null;
  }

  if (budget.allowCustomerMealClarification) {
    if (budget.consolidatedQuestion) {
      const evidenceError = assertCustomerFoodStatementEvidenceBacked({
        statement: budget.consolidatedQuestion,
        mealObservations: decision.mealObservations,
      });
      if (!evidenceError) {
        followUpForTomorrow = budget.consolidatedQuestion;
      }
    } else if (budget.selectedMealSlot && budget.selectedQuestion) {
      mealFeedback[budget.selectedMealSlot] = setMealFollowUp(
        mealFeedback[budget.selectedMealSlot],
        budget.selectedQuestion,
      );
    }
  } else if (
    followUpForTomorrow &&
    isClarificationQuestion(followUpForTomorrow) &&
    /奶昔|蛋白飲|代餐/.test(followUpForTomorrow)
  ) {
    // Hunger / ineligible path: do not leave shake-pairing noise in tomorrow follow-up.
    followUpForTomorrow = null;
  }

  const coachFollowUps = (output.coach.follow_ups ?? []).filter((item) => {
    if (!item.subject.startsWith("meal_")) {
      return true;
    }
    if (!budget.allowCustomerMealClarification) {
      return false;
    }
    if (budget.consolidatedQuestion) {
      return false;
    }
    if (!budget.selectedMealSlot) {
      return false;
    }
    return item.subject === `meal_${budget.selectedMealSlot}`;
  });

  if (budget.consolidatedQuestion) {
    const evidenceError = assertCustomerFoodStatementEvidenceBacked({
      statement: budget.consolidatedQuestion,
      mealObservations: decision.mealObservations,
    });
    if (!evidenceError) {
      const already = coachFollowUps.some((item) => item.question === budget.consolidatedQuestion);
      if (!already) {
        coachFollowUps.unshift({
          subject: "meal_clarification",
          question: budget.consolidatedQuestion,
          status: "pending",
        });
      }
    }
  }

  return {
    ...output,
    customer: {
      ...output.customer,
      meal_feedback: mealFeedback,
      follow_up_for_tomorrow: followUpForTomorrow,
    },
    coach: {
      ...output.coach,
      follow_ups: coachFollowUps.slice(0, 4),
    },
  };
}

export function countCustomerMealClarificationQuestions(
  output: CoachingDailyGenerationOutputJson,
): number {
  let count = 0;
  for (const slot of PRIMARY_SLOTS) {
    const question = output.customer.meal_feedback[slot]?.follow_up_question;
    if (isClarificationQuestion(question)) {
      count += 1;
    }
  }
  if (isClarificationQuestion(output.customer.follow_up_for_tomorrow)) {
    count += 1;
  }
  return count;
}
