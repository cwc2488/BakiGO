/**
 * Deterministic Coach Directive × Meal Vision verification.
 * Layers must not merge: Directive ≠ Vision ≠ AI wording.
 */

export const DIRECTIVE_MEAL_SLOTS = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "general",
] as const;

export type DirectiveMealSlot = (typeof DIRECTIVE_MEAL_SLOTS)[number];

export type DirectiveVerificationStatus =
  | "followed"
  | "possible_not_followed"
  | "unknown"
  | "ignored";

export type StructuredCoachDirective = {
  id: string;
  mealSlot: DirectiveMealSlot;
  instructionText: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  status: "active" | "paused" | "completed";
  customerVisible: boolean;
};

export type MealObservationForVerify = {
  mealSlot: string;
  shakeObserved?: boolean | null;
  observedFoods?: string[];
  uncertainties?: string[];
  confidence?: number | null;
};

export type DirectiveVerificationResult = {
  directiveId: string;
  mealSlot: DirectiveMealSlot;
  instructionText: string;
  status: DirectiveVerificationStatus;
  customerCopy: string | null;
  coachCopy: string | null;
  reason: string;
};

function isActiveOnDate(directive: StructuredCoachDirective, logDate: string): boolean {
  if (directive.status !== "active") return false;
  if (logDate < directive.effectiveFrom) return false;
  if (directive.effectiveUntil && logDate > directive.effectiveUntil) return false;
  return true;
}

function mentionsShake(text: string): boolean {
  return /奶昔|蛋白奶昔|代餐奶昔|shake/i.test(text);
}

function foodMentionsShake(foods: string[] | undefined): boolean {
  if (!foods?.length) return false;
  return foods.some((f) => /奶昔|shake|protein.?shake/i.test(f));
}

function observationForSlot(
  observations: MealObservationForVerify[],
  slot: DirectiveMealSlot,
): MealObservationForVerify | null {
  if (slot === "general") {
    return observations[0] ?? null;
  }
  return observations.find((o) => o.mealSlot === slot) ?? null;
}

function slotLabel(slot: DirectiveMealSlot): string {
  if (slot === "breakfast") return "早餐";
  if (slot === "lunch") return "午餐";
  if (slot === "dinner") return "晚餐";
  if (slot === "snack") return "點心";
  return "今日";
}

/**
 * CD verification — deterministic.
 * Never asserts absolute non-consumption from missing photo evidence.
 */
export function verifyCoachDirectivesAgainstMeals(input: {
  logDate: string;
  directives: StructuredCoachDirective[];
  mealObservations: MealObservationForVerify[];
  /** Customer explicitly said they consumed separately (note). */
  customerNote?: string | null;
}): DirectiveVerificationResult[] {
  const note = input.customerNote?.trim() ?? "";
  const noteClaimsConsumed = /另外(有)?喝|有喝了|已經喝|自己喝/.test(note);

  const results: DirectiveVerificationResult[] = [];

  for (const directive of input.directives) {
    if (!isActiveOnDate(directive, input.logDate)) {
      results.push({
        directiveId: directive.id,
        mealSlot: directive.mealSlot,
        instructionText: directive.instructionText,
        status: "ignored",
        customerCopy: null,
        coachCopy: null,
        reason: "expired_or_inactive",
      });
      continue;
    }

    const obs = observationForSlot(input.mealObservations, directive.mealSlot);
    const label = slotLabel(directive.mealSlot);
    const wantsShake = mentionsShake(directive.instructionText);

    if (!obs) {
      results.push({
        directiveId: directive.id,
        mealSlot: directive.mealSlot,
        instructionText: directive.instructionText,
        status: "unknown",
        customerCopy: null,
        coachCopy: `${label}指示「${directive.instructionText}」尚無對應餐次照片可核對。`,
        reason: "no_observation",
      });
      continue;
    }

    const uncertain =
      (obs.uncertainties?.length ?? 0) > 0 ||
      (obs.confidence != null && obs.confidence < 0.45);

    if (wantsShake) {
      const seen = obs.shakeObserved === true || foodMentionsShake(obs.observedFoods);
      if (seen) {
        results.push({
          directiveId: directive.id,
          mealSlot: directive.mealSlot,
          instructionText: directive.instructionText,
          status: "followed",
          customerCopy: `${label}有看到你按照教練安排喝奶昔 👍`,
          coachCopy: `${label}指示「喝奶昔」：照片可見奶昔相關訊號。`,
          reason: "shake_visible",
        });
        continue;
      }
      if (uncertain) {
        results.push({
          directiveId: directive.id,
          mealSlot: directive.mealSlot,
          instructionText: directive.instructionText,
          status: "unknown",
          customerCopy: null,
          coachCopy: `${label}指示「喝奶昔」：照片訊號不確定，不判定未執行。`,
          reason: "vision_uncertain",
        });
        continue;
      }
      if (noteClaimsConsumed) {
        results.push({
          directiveId: directive.id,
          mealSlot: directive.mealSlot,
          instructionText: directive.instructionText,
          status: "unknown",
          customerCopy: null,
          coachCopy: `${label}照片未見奶昔，但顧客留言表示另有飲用——不判未執行。`,
          reason: "customer_claims_separate",
        });
        continue;
      }
      results.push({
        directiveId: directive.id,
        mealSlot: directive.mealSlot,
        instructionText: directive.instructionText,
        status: "possible_not_followed",
        customerCopy: `${label}照片裡目前沒有看到教練安排的奶昔；如果你有另外喝，也可以補充告訴我。`,
        coachCopy: `${label}指示「喝奶昔」：照片未見奶昔（不得斷言顧客沒喝）。`,
        reason: "shake_not_visible",
      });
      continue;
    }

    // Generic instruction: cannot auto-verify without structured expect → unknown
    results.push({
      directiveId: directive.id,
      mealSlot: directive.mealSlot,
      instructionText: directive.instructionText,
      status: "unknown",
      customerCopy: null,
      coachCopy: `${label}指示「${directive.instructionText}」：無結構化核對規則，僅供 AI 參考。`,
      reason: "generic_instruction",
    });
  }

  return results;
}

export function customerSafeDirectiveLines(
  directives: StructuredCoachDirective[],
  logDate: string,
): string[] {
  return directives
    .filter((d) => d.customerVisible && isActiveOnDate(d, logDate))
    .map((d) => {
      const label = slotLabel(d.mealSlot);
      return d.mealSlot === "general" ? d.instructionText : `${label}：${d.instructionText}`;
    });
}
