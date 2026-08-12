import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCoachingAiFixtureGenerationInput } from "../src/lib/coaching/ai/coaching-ai-fixtures";
import { extractCustomerVoiceSignals } from "../src/lib/coaching/ai/extract-customer-voice";
import { loadPreparedCoachingEvalMealImages } from "../src/lib/coaching/ai/coaching-eval-fixture-images";
import { buildHeuristicMealObservations } from "../src/lib/coaching/ai/observe-coaching-meals";
import { buildCoachingDecisionContext } from "../src/lib/coaching/ai/coaching-signal-engine";

async function main() {
  const scenario = "D_hunger_shake_fried_rice" as const;
  const fixture = buildCoachingAiFixtureGenerationInput(scenario);
  const prepared = await loadPreparedCoachingEvalMealImages(scenario);
  const mealObservations = buildHeuristicMealObservations({
    generationInput: fixture.generationInput,
    preparedMealImages: prepared,
  });
  const customerVoice = extractCustomerVoiceSignals(fixture.generationInput.todayContext.customerNote);
  const decision = buildCoachingDecisionContext({
    generationInput: fixture.generationInput,
    mealObservations,
    customerVoice,
    finalInterventionLevelOverride: fixture.finalInterventionLevel,
  });

  const payload = {
    scenario,
    note: "deterministic-only (no OpenAI); Meal Vision GPT + Daily Coach GPT blocked without OPENAI_API_KEY",
    images: prepared.map((p) => ({
      mealSlot: p.mealSlot,
      sourceStoragePath: p.sourceStoragePath,
      bytes: p.byteLength,
    })),
    today: {
      customerNote: fixture.generationInput.todayContext.customerNote,
      waterMl: fixture.generationInput.todayContext.waterMl,
      meals: fixture.generationInput.todayContext.primaryMeals.map((m) => ({
        mealSlot: m.mealSlot,
        textNote: m.textNote,
      })),
      sleepBedtime: fixture.generationInput.todayContext.sleepBedtime,
      sleepWakeTime: fixture.generationInput.todayContext.sleepWakeTime,
      exerciseNote: fixture.generationInput.todayContext.exerciseNote,
      bowelMovementCount: fixture.generationInput.todayContext.bowelMovementCount,
    },
    mealObservations,
    customerVoice,
    topPriorities: decision.priorities.map((p) => ({
      rank: p.rank,
      signalKey: p.signalKey,
      reason: p.reason,
      tomorrowFocusSubject: p.tomorrowFocusSubject,
    })),
    pendingFollowUps: decision.pendingFollowUps,
    finalInterventionLevel: decision.finalInterventionLevel,
    coachAttention: decision.coachAttention,
  };

  const outPath = resolve(process.cwd(), ".tmp-coaching-d-deterministic.json");
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  console.log(`WROTE ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
