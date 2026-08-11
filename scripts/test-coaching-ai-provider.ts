import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildScenarioDecisionContext } from "../src/lib/coaching/ai/build-scenario-decision-context";
import { OpenAiCoachingAiProvider } from "../src/lib/coaching/ai/coaching-ai-provider";
import { buildLlmCallLogEntry } from "../src/lib/ai/llm-telemetry";
import { COACHING_DAILY_AI_PROMPT_VERSION } from "../src/lib/coaching/ai/model-config";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log("SKIP: OPENAI_API_KEY not set — no real provider call made.");
    return;
  }

  const packed = buildScenarioDecisionContext("B_breakfast_deviation");
  const provider = new OpenAiCoachingAiProvider(process.env.OPENAI_API_KEY.trim());

  const startedAt = Date.now();
  const result = await provider.generateDailyCoach({
    generationInput: packed.generationInput,
    finalInterventionLevel: packed.finalInterventionLevel,
    decisionContext: packed.decisionContext,
    preparedMealImages: [],
  });
  const elapsedMs = Date.now() - startedAt;

  const telemetry = buildLlmCallLogEntry({
    feature: "coaching",
    pointKey: "daily_coach_generation",
    customerId: packed.generationInput.customerId,
    enrollmentId: packed.generationInput.enrollmentId,
    ownerMemberId: null,
    model: result.model,
    promptVersion: COACHING_DAILY_AI_PROMPT_VERSION,
    usage: {
      inputTokens: result.usage.inputTokens,
      cachedInputTokens: result.usage.cachedInputTokens,
      outputTokens: result.usage.outputTokens,
      imageCount: result.usage.imageCount,
    },
    latencyMs: result.latencyMs,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        scenario: "B_breakfast_deviation",
        latencyMs: elapsedMs,
        providerLatencyMs: result.latencyMs,
        model: result.model,
        usage: result.usage,
        estimatedCostUsd: telemetry.estimatedCostUsd,
        pricingFound: telemetry.pricingFound,
        output: result.output,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
