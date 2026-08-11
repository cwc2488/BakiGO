import { describe, expect, it } from "vitest";
import { estimateLlmCost } from "@/lib/ai/cost-estimator";

describe("cost estimator", () => {
  it("computes deterministic USD from fixture usage", () => {
    const result = estimateLlmCost({
      model: "gpt-4.1-mini",
      inputTokens: 1000,
      cachedInputTokens: 200,
      outputTokens: 500,
      imageCount: 2,
    });

    expect(result.pricingFound).toBe(true);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("returns null cost when model pricing is unknown", () => {
    const result = estimateLlmCost({
      model: "unknown-model",
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 500,
    });

    expect(result.pricingFound).toBe(false);
    expect(result.estimatedCostUsd).toBeNull();
  });
});
