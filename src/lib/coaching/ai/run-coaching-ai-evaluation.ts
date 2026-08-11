import { buildLlmCallLogEntry } from "@/lib/ai/llm-telemetry";
import type { CoachingAiFixtureScenario } from "@/lib/coaching/ai/coaching-ai-fixtures";
import { OpenAiCoachingAiProvider } from "@/lib/coaching/ai/coaching-ai-provider";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import {
  buildCoachingEvalImageTelemetry,
  loadPreparedCoachingEvalMealImages,
} from "@/lib/coaching/ai/coaching-eval-fixture-images";
import {
  evaluateCoachingAiOutputQuality,
  projectCoachingAiMonthlyCostUsd,
  type CoachingAiQualityReport,
} from "@/lib/coaching/ai/coaching-ai-quality-check";
import { COACHING_DAILY_AI_MODEL_ID } from "@/lib/coaching/ai/model-config";
import type { CoachingDailyGenerationOutputJson, CoachingMealImageUsageMetadata } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";

export type CoachingAiEvaluationScenarioResult = {
  scenario: CoachingAiFixtureScenario;
  model: string;
  latencyMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  imageCount: number;
  imageResizeMetadata: CoachingMealImageUsageMetadata;
  pricingFound: boolean;
  estimatedCostUsd: number | null;
  decisionContext: CoachingDecisionContext;
  output: CoachingDailyGenerationOutputJson;
  quality: CoachingAiQualityReport;
};

export type CoachingAiEvaluationReport = {
  ranAt: string;
  model: string;
  scenarios: CoachingAiEvaluationScenarioResult[];
  costProjection: ReturnType<typeof projectCoachingAiMonthlyCostUsd>;
  averageEstimatedCostUsd: number | null;
};

const ALL_SCENARIOS: CoachingAiFixtureScenario[] = [
  "A_normal",
  "B_breakfast_deviation",
  "C_watch_pattern",
];

export async function runCoachingAiControlledEvaluation(input?: {
  apiKey?: string;
  scenarios?: CoachingAiFixtureScenario[];
}): Promise<CoachingAiEvaluationReport> {
  const apiKey = input?.apiKey?.trim() ?? process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY unavailable — controlled evaluation cannot run.");
  }

  const provider = new OpenAiCoachingAiProvider(apiKey);
  const scenarios = input?.scenarios ?? ALL_SCENARIOS;
  const results: CoachingAiEvaluationScenarioResult[] = [];

  for (const scenario of scenarios) {
    const packed = buildScenarioDecisionContext(scenario);
    const preparedMealImages = await loadPreparedCoachingEvalMealImages(scenario);
    const imageResizeMetadata = buildCoachingEvalImageTelemetry(preparedMealImages);

    const result = await provider.generateDailyCoach({
      generationInput: packed.generationInput,
      finalInterventionLevel: packed.finalInterventionLevel,
      decisionContext: packed.decisionContext,
      preparedMealImages,
    });

    const telemetryEntry = buildLlmCallLogEntry({
      feature: "coaching",
      pointKey: "daily_coach_generation",
      customerId: packed.generationInput.customerId,
      enrollmentId: packed.generationInput.enrollmentId,
      ownerMemberId: null,
      model: result.model,
      promptVersion: result.promptVersion,
      usage: {
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        outputTokens: result.usage.outputTokens,
        imageCount: result.usage.imageCount,
      },
      imageUsageMetadata: { coachingMealImages: imageResizeMetadata },
      latencyMs: result.latencyMs,
    });

    results.push({
      scenario,
      model: result.model,
      latencyMs: result.latencyMs,
      inputTokens: result.usage.inputTokens,
      cachedInputTokens: result.usage.cachedInputTokens,
      outputTokens: result.usage.outputTokens,
      imageCount: result.usage.imageCount,
      imageResizeMetadata,
      pricingFound: telemetryEntry.pricingFound,
      estimatedCostUsd: telemetryEntry.estimatedCostUsd,
      decisionContext: packed.decisionContext,
      output: result.output,
      quality: evaluateCoachingAiOutputQuality({
        output: result.output,
        finalInterventionLevel: packed.finalInterventionLevel,
        priorTomorrowFocus: packed.generationInput.priorAiContext?.tomorrowFocus?.value ?? null,
        generationInput: packed.generationInput,
      }),
    });
  }

  const priced = results.map((item) => item.estimatedCostUsd).filter((value): value is number => value != null);
  const averageEstimatedCostUsd =
    priced.length > 0 ? priced.reduce((sum, value) => sum + value, 0) / priced.length : null;

  return {
    ranAt: new Date().toISOString(),
    model: COACHING_DAILY_AI_MODEL_ID,
    scenarios: results,
    averageEstimatedCostUsd,
    costProjection: projectCoachingAiMonthlyCostUsd(averageEstimatedCostUsd),
  };
}

export function isCoachingAiEvaluationAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
