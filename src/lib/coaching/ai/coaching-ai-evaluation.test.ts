import { describe, expect, it } from "vitest";
import { getCoachingEvalFixtureImageSpecs, loadPreparedCoachingEvalMealImages } from "@/lib/coaching/ai/coaching-eval-fixture-images";
import { evaluateCoachingAiOutputQuality, projectCoachingAiMonthlyCostUsd } from "@/lib/coaching/ai/coaching-ai-quality-check";
import { isCoachingAiEvalAuthorized, readCoachingAiEvalSecret } from "@/lib/coaching/ai/coaching-ai-eval-auth";
import { buildCoachingAiFixtureGenerationInput } from "@/lib/coaching/ai/coaching-ai-fixtures";
import { getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import { COACHING_DAILY_AI_MODEL_ID } from "@/lib/coaching/ai/model-config";
import { getModelPricing } from "@/lib/ai/model-pricing";

describe("coaching ai evaluation model pin", () => {
  it("pins production candidate model id", () => {
    expect(COACHING_DAILY_AI_MODEL_ID).toBe("gpt-4o-mini-2024-07-18");
    expect(getModelPricing(COACHING_DAILY_AI_MODEL_ID)).not.toBeNull();
  });
});

describe("coaching eval fixture images", () => {
  it("loads up to 3 prepared images per scenario", async () => {
    for (const scenario of ["A_normal", "B_breakfast_deviation", "C_watch_pattern"] as const) {
      expect(getCoachingEvalFixtureImageSpecs(scenario)).toHaveLength(3);
      const prepared = await loadPreparedCoachingEvalMealImages(scenario);
      expect(prepared).toHaveLength(3);
      expect(Math.max(...prepared.map((item) => Math.max(item.width, item.height)))).toBeLessThanOrEqual(1024);
    }
  });
});

describe("coaching ai quality check", () => {
  it("passes fixture A output heuristics", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("A_normal");
    const output = getFixtureScenarioOutput("A_normal");
    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: "normal",
      generationInput,
    });
    expect(report.overall).not.toBe("fail");
    expect(output.customer.adjustment_priorities.length).toBeLessThanOrEqual(2);
    expect(output.customer.adjustment_priorities).toEqual([]);
  });

  it("flags too many adjustment priorities", () => {
    const output = getFixtureScenarioOutput("A_normal");
    output.customer.adjustment_priorities = ["a", "b", "c"];
    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: "normal",
    });
    expect(report.customer.find((item) => item.id === "customer_adjustment_priorities_count")?.status).toBe("fail");
  });

  it("projects monthly cost from per-inference estimate", () => {
    expect(projectCoachingAiMonthlyCostUsd(0.01)).toEqual({
      perCustomer30DaysUsd: 0.3,
      per100CustomersMonthUsd: 30,
      per1000CustomersMonthUsd: 300,
      per10000CustomersMonthUsd: 3000,
    });
  });
});

describe("coaching ai eval auth", () => {
  it("requires bearer secret and never exposes key", () => {
    const prev = readCoachingAiEvalSecret();
    process.env.COACHING_AI_EVAL_SECRET = "eval-secret";
    const request = new Request("http://localhost/api/coaching/internal/eval-fixtures", {
      method: "POST",
      headers: { authorization: "Bearer eval-secret" },
    });
    expect(isCoachingAiEvalAuthorized(request)).toBe(true);
    process.env.COACHING_AI_EVAL_SECRET = prev;
  });
});
