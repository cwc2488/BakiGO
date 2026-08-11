import { getModelPricing } from "@/lib/ai/model-pricing";
import type { LlmCostEstimateInput, LlmCostEstimateResult } from "@/types/coaching-ai";

function tokenCost(tokens: number, pricePer1M: number): number {
  if (tokens <= 0 || pricePer1M <= 0) {
    return 0;
  }
  return (tokens / 1_000_000) * pricePer1M;
}

/** Deterministic USD estimate from usage counts + centralized pricing table. */
export function estimateLlmCost(input: LlmCostEstimateInput): LlmCostEstimateResult {
  const inputTokens = Math.max(0, input.inputTokens ?? 0);
  const cachedInputTokens = Math.max(0, input.cachedInputTokens ?? 0);
  const outputTokens = Math.max(0, input.outputTokens ?? 0);
  const imageCount = Math.max(0, input.imageCount ?? 0);

  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const pricing = getModelPricing(input.model);

  if (!pricing) {
    return {
      model: input.model,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      imageCount,
      estimatedCostUsd: null,
      pricingFound: false,
    };
  }

  const inputCost = tokenCost(uncachedInputTokens, pricing.inputPer1M);
  const cachedCost = tokenCost(cachedInputTokens, pricing.cachedInputPer1M);
  const outputCost = tokenCost(outputTokens, pricing.outputPer1M);
  const imageCost = pricing.imagePerUnit ? imageCount * pricing.imagePerUnit : 0;

  const estimatedCostUsd = roundUsd(inputCost + cachedCost + outputCost + imageCost);

  return {
    model: input.model,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    imageCount,
    estimatedCostUsd,
    pricingFound: true,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}
