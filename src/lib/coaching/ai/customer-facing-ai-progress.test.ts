import { describe, expect, it } from "vitest";
import { resolveCustomerFacingAiProgress } from "@/lib/coaching/ai/customer-facing-ai-progress";

describe("customer-facing AI progress steps", () => {
  it("P0-D maps backend status to human stages without fake percent", () => {
    expect(resolveCustomerFacingAiProgress("pending").activeStep).toBe("organizing_meals");
    expect(resolveCustomerFacingAiProgress("processing").activeStep).toBe("analyzing_day");
    expect(resolveCustomerFacingAiProgress("completed").activeStep).toBe("personalized_ready");
    expect(resolveCustomerFacingAiProgress("failed").activeStep).toBe("analyzing_day");
  });
});
