export type CustomerFacingAiProgressStep =
  | "received"
  | "organizing_meals"
  | "analyzing_day"
  | "personalized_ready";

export function resolveCustomerFacingAiProgress(
  status: "pending" | "processing" | "completed" | "failed" | "missing",
): {
  progressSteps: CustomerFacingAiProgressStep[];
  activeStep: CustomerFacingAiProgressStep;
} {
  const progressSteps: CustomerFacingAiProgressStep[] = [
    "received",
    "organizing_meals",
    "analyzing_day",
    "personalized_ready",
  ];
  if (status === "completed") {
    return { progressSteps, activeStep: "personalized_ready" };
  }
  if (status === "processing") {
    return { progressSteps, activeStep: "analyzing_day" };
  }
  if (status === "pending" || status === "missing") {
    return { progressSteps, activeStep: "organizing_meals" };
  }
  return { progressSteps, activeStep: "analyzing_day" };
}
