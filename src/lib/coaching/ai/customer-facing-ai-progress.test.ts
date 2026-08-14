import { describe, expect, it } from "vitest";
import { resolveCustomerFacingAiProgress } from "@/lib/coaching/ai/customer-facing-ai-progress";

describe("customer-facing AI progress steps", () => {
  it("P0-D maps backend status to human stages without fake percent", () => {
    expect(resolveCustomerFacingAiProgress("pending").activeStep).toBe("organizing_meals");
    expect(resolveCustomerFacingAiProgress("processing").activeStep).toBe("preparing_advice");
    expect(resolveCustomerFacingAiProgress("completed").activeStep).toBe("personalized_ready");
    expect(resolveCustomerFacingAiProgress("failed").activeStep).toBe("analyzing_day");
    expect(resolveCustomerFacingAiProgress("pending").progressSteps).toEqual([
      "received",
      "organizing_meals",
      "analyzing_day",
      "preparing_advice",
      "personalized_ready",
    ]);
  });

  it("P0.4 omits meal-look stage when day has no meal photos", () => {
    const pending = resolveCustomerFacingAiProgress({ status: "pending", hasMealPhotos: false });
    expect(pending.progressSteps).toEqual([
      "received",
      "analyzing_day",
      "preparing_advice",
      "personalized_ready",
    ]);
    expect(pending.activeStep).toBe("analyzing_day");
    expect(pending.progressSteps).not.toContain("organizing_meals");
  });
});
