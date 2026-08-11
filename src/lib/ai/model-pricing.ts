/** Centralized OpenAI model pricing (USD per 1M tokens). Update when vendor prices change. */
export type ModelPricingTier = {
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
  /** USD per image input (vision), when applicable */
  imagePerUnit?: number;
};

export const LLM_MODEL_PRICING: Record<string, ModelPricingTier> = {
  "gpt-4.1-mini": {
    inputPer1M: 0.4,
    cachedInputPer1M: 0.1,
    outputPer1M: 1.6,
    imagePerUnit: 0.002,
  },
  "gpt-4.1": {
    inputPer1M: 2.0,
    cachedInputPer1M: 0.5,
    outputPer1M: 8.0,
    imagePerUnit: 0.003,
  },
  "gpt-4o-mini": {
    inputPer1M: 0.15,
    cachedInputPer1M: 0.075,
    outputPer1M: 0.6,
    imagePerUnit: 0.002,
  },
  "gpt-4o-mini-2024-07-18": {
    inputPer1M: 0.15,
    cachedInputPer1M: 0.075,
    outputPer1M: 0.6,
    imagePerUnit: 0.002,
  },
};

export function getModelPricing(model: string): ModelPricingTier | null {
  return LLM_MODEL_PRICING[model] ?? null;
}

export function listPricedModels(): string[] {
  return Object.keys(LLM_MODEL_PRICING);
}
