export type CustomerFacingAiProgressStep =
  | "received"
  | "organizing_meals"
  | "analyzing_day"
  | "preparing_advice"
  | "personalized_ready";

export type ResolveCustomerFacingAiProgressInput = {
  status: "pending" | "processing" | "completed" | "failed" | "missing";
  /** When false, omit meal-look stage (no pretend vision). Default true for backward compat. */
  hasMealPhotos?: boolean;
};

/**
 * Server-status → customer progress only.
 * pending ≈ queue / meal look; processing ≈ organizing + NL advice; no fake %.
 * Meal-look step is omitted when the day has no meal photos.
 */
export function resolveCustomerFacingAiProgress(
  statusOrInput:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "missing"
    | ResolveCustomerFacingAiProgressInput,
): {
  progressSteps: CustomerFacingAiProgressStep[];
  activeStep: CustomerFacingAiProgressStep;
} {
  const input: ResolveCustomerFacingAiProgressInput =
    typeof statusOrInput === "string" ? { status: statusOrInput } : statusOrInput;
  const { status } = input;
  const hasMealPhotos = input.hasMealPhotos !== false;

  const progressSteps: CustomerFacingAiProgressStep[] = hasMealPhotos
    ? ["received", "organizing_meals", "analyzing_day", "preparing_advice", "personalized_ready"]
    : ["received", "analyzing_day", "preparing_advice", "personalized_ready"];

  if (status === "completed") {
    return { progressSteps, activeStep: "personalized_ready" };
  }
  if (status === "processing") {
    return { progressSteps, activeStep: "preparing_advice" };
  }
  if (status === "pending" || status === "missing") {
    return {
      progressSteps,
      activeStep: hasMealPhotos ? "organizing_meals" : "analyzing_day",
    };
  }
  return { progressSteps, activeStep: "analyzing_day" };
}
