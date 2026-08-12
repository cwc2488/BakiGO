import {
  buildCoachingAiFixtureGenerationInput,
  type CoachingAiFixtureScenario,
} from "@/lib/coaching/ai/coaching-ai-fixtures";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import {
  buildCoachingDecisionContext,
  getFixtureMealObservations,
} from "@/lib/coaching/ai/coaching-signal-engine";
import type { CoachingDecisionContext } from "@/types/coaching-signals";

export function buildScenarioDecisionContext(
  scenario: CoachingAiFixtureScenario,
): {
  generationInput: ReturnType<typeof buildCoachingAiFixtureGenerationInput>["generationInput"];
  finalInterventionLevel: ReturnType<typeof buildCoachingAiFixtureGenerationInput>["finalInterventionLevel"];
  decisionContext: CoachingDecisionContext;
} {
  const fixture = buildCoachingAiFixtureGenerationInput(scenario);
  const decisionContext = buildCoachingDecisionContext({
    generationInput: fixture.generationInput,
    mealObservations: getFixtureMealObservations(scenario),
    customerVoice: extractCustomerVoiceSignals(fixture.generationInput.todayContext.customerNote),
    finalInterventionLevelOverride: fixture.finalInterventionLevel,
  });

  return {
    generationInput: fixture.generationInput,
    finalInterventionLevel: decisionContext.finalInterventionLevel,
    decisionContext,
  };
}
