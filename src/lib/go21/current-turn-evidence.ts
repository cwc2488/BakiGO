/**
 * Authoritative current-turn evidence for Go21 generation.
 *
 * CURRENT TURN outranks historical context for understanding
 * what the customer is showing/saying NOW.
 *
 * History may interpret; history must never replace current semantics.
 */

export type Go21CurrentTurnEvidenceKind =
  | "none"
  | "text"
  | "image_food"
  | "image_non_food"
  | "image_unclear";

export type Go21CurrentTurnEvidence = {
  kind: Go21CurrentTurnEvidenceKind;
  /** True when this turn has a photo attachment. */
  hasPhoto: boolean;
  /** Structural food gate for THIS turn's image (null if no photo). */
  foodRelevant: boolean | null;
  /** Human-readable description of what the current image shows (when known). */
  imageDescription: string | null;
  /** Evidence summary for prompts (non-food or food). */
  visionSummary: string | null;
  /** Soft confidence from vision gate. */
  confidence: "high" | "medium" | "low" | null;
  guidance: string;
};

export function buildGo21CurrentTurnEvidence(input: {
  hasPhoto: boolean;
  customerMessage: string;
  foodRelevant: boolean | null;
  imageDescription: string | null;
  visionSummary: string | null;
  confidence?: "high" | "medium" | "low" | null;
}): Go21CurrentTurnEvidence {
  const msg = input.customerMessage.trim();
  if (!input.hasPhoto) {
    return {
      kind: msg ? "text" : "none",
      hasPhoto: false,
      foodRelevant: null,
      imageDescription: null,
      visionSummary: null,
      confidence: null,
      guidance:
        "No photo this turn. Use text as current-turn evidence. Historical meals are history only.",
    };
  }

  if (input.foodRelevant === false) {
    return {
      kind: "image_non_food",
      hasPhoto: true,
      foodRelevant: false,
      imageDescription: input.imageDescription,
      visionSummary: input.visionSummary,
      confidence: input.confidence ?? "medium",
      guidance:
        "CURRENT IMAGE is non-food. Conversation may react to imageDescription. " +
        "FORBIDDEN for this turn: meal mutation, calorie/protein estimate, coach-plan meal completion, " +
        "treating todayEaten / prior meals / openPlans as what this image shows.",
    };
  }

  if (input.foodRelevant === true) {
    return {
      kind: "image_food",
      hasPhoto: true,
      foodRelevant: true,
      imageDescription: input.imageDescription,
      visionSummary: input.visionSummary,
      confidence: input.confidence ?? "medium",
      guidance:
        "CURRENT IMAGE is food-relevant. Prefer current vision over historical meal notes for what is shown NOW.",
    };
  }

  return {
    kind: "image_unclear",
    hasPhoto: true,
    foodRelevant: false,
    imageDescription: input.imageDescription,
    visionSummary: input.visionSummary,
    confidence: input.confidence ?? "low",
    guidance:
      "CURRENT IMAGE food relevance unclear. Do not invent meal contents from history. Ask or react socially if needed.",
  };
}

/** True when nutrition / meal mutation paths must stay closed for this turn. */
export function go21CurrentTurnBlocksNutritionMutation(
  evidence: Go21CurrentTurnEvidence | null | undefined,
): boolean {
  if (!evidence?.hasPhoto) return false;
  return evidence.foodRelevant !== true;
}
