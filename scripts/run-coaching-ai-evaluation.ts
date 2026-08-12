import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CoachingAiFixtureScenario } from "../src/lib/coaching/ai/coaching-ai-fixtures";
import { runCoachingAiControlledEvaluation } from "../src/lib/coaching/ai/run-coaching-ai-evaluation";

function loadEnvFile(path: string): void {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value || value === "[SENSITIVE]") {
      continue;
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** Split large payloads so Vercel build logs do not truncate mid-JSON. */
function printChunkedBase64(label: string, payload: unknown): void {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const chunkSize = 1200;
  const total = Math.max(1, Math.ceil(encoded.length / chunkSize));
  console.log(`${label}_META:${JSON.stringify({ bytes: encoded.length, chunks: total })}`);
  for (let i = 0; i < total; i += 1) {
    const part = encoded.slice(i * chunkSize, (i + 1) * chunkSize);
    console.log(`${label}_CHUNK:${i}:${total}:${part}`);
  }
  console.log(`${label}_END`);
}

type EvalScenario = Awaited<ReturnType<typeof runCoachingAiControlledEvaluation>>["scenarios"][number];

function countMealClarifications(output: EvalScenario["output"]): number {
  const pattern = /還有沒有搭配|除了.{0,8}還有|還有吃別的|其他東西|其他食物|有沒有搭配/;
  let count = 0;
  for (const slot of ["breakfast", "lunch", "dinner"] as const) {
    const q = output.customer.meal_feedback[slot]?.follow_up_question;
    if (q && pattern.test(q)) count += 1;
  }
  return count;
}

function printRegressionScenario(scenario: EvalScenario) {
  const compact = {
    scenario: scenario.scenario,
    model: scenario.model,
    latencyMs: scenario.latencyMs,
    observationLatencyMs: scenario.observationLatencyMs,
    inputTokens: scenario.inputTokens,
    observationInputTokens: scenario.observationInputTokens,
    outputTokens: scenario.outputTokens,
    observationOutputTokens: scenario.observationOutputTokens,
    imageCount: scenario.imageCount,
    estimatedCostUsd: scenario.estimatedCostUsd,
    qualityOverall: scenario.quality.overall,
    dailyNutritionAssessment: scenario.decisionContext.dailyNutritionAssessment,
    mealFollowUpBudget: scenario.decisionContext.mealFollowUpBudget,
    mealClarificationCount: countMealClarifications(scenario.output),
    priorities: scenario.decisionContext.priorities.map((item) => ({
      rank: item.rank,
      signalKey: item.signalKey,
      reason: item.reason,
      tomorrowFocusSubject: item.tomorrowFocusSubject,
    })),
    finalInterventionLevel: scenario.decisionContext.finalInterventionLevel,
    recurringIssue: scenario.decisionContext.recurringIssue?.key ?? null,
    improvedIssue: scenario.decisionContext.improvedIssue?.key ?? null,
    coachAttentionRequired: scenario.decisionContext.coachAttention.required,
    goalContext: scenario.decisionContext.goalContext,
    outcomeAssessment: {
      outcomeStatus: scenario.decisionContext.outcomeAssessment.outcomeStatus,
      trendStatus: scenario.decisionContext.outcomeAssessment.trendStatus,
      customerSummary: scenario.decisionContext.outcomeAssessment.customerSummary,
      reasons: scenario.decisionContext.outcomeAssessment.reasons,
      periods: scenario.decisionContext.outcomeAssessment.periods,
      comparisonInterpretation:
        scenario.decisionContext.outcomeAssessment.comparison?.interpretation ?? null,
      comparisonReasons: scenario.decisionContext.outcomeAssessment.comparison?.reasons ?? [],
    },
    customer: {
      encouragement: scenario.output.customer.encouragement,
      today_feedback: scenario.output.customer.today_feedback,
      daily_food_summary: scenario.output.customer.daily_food_summary,
      adjustment_priorities: scenario.output.customer.adjustment_priorities,
      tomorrow_focus: scenario.output.customer.tomorrow_focus,
      customer_voice_response: scenario.output.customer.customer_voice_response,
      follow_up_for_tomorrow: scenario.output.customer.follow_up_for_tomorrow,
      meal_follow_ups: {
        breakfast: scenario.output.customer.meal_feedback.breakfast?.follow_up_question ?? null,
        lunch: scenario.output.customer.meal_feedback.lunch?.follow_up_question ?? null,
        dinner: scenario.output.customer.meal_feedback.dinner?.follow_up_question ?? null,
      },
    },
    coach: {
      daily_summary: scenario.output.coach.daily_summary,
      proposed_intervention_level: scenario.output.coach.proposed_intervention_level,
      daily_nutrition_assessment: scenario.output.coach.daily_nutrition_assessment,
      follow_ups: scenario.output.coach.follow_ups,
    },
  };
  console.log(`COACHING_EVAL_SCENARIO:${scenario.scenario}:${JSON.stringify(compact)}`);
}

function printDetailedScenario(scenario: EvalScenario) {
  const label = `COACHING_EVAL_${scenario.scenario.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FULL`;
  printChunkedBase64(label, {
    scenario: scenario.scenario,
    model: scenario.model,
    latencyMs: scenario.latencyMs,
    observationLatencyMs: scenario.observationLatencyMs,
    inputTokens: scenario.inputTokens,
    cachedInputTokens: scenario.cachedInputTokens,
    outputTokens: scenario.outputTokens,
    observationInputTokens: scenario.observationInputTokens,
    observationOutputTokens: scenario.observationOutputTokens,
    imageCount: scenario.imageCount,
    estimatedCostUsd: scenario.estimatedCostUsd,
    qualityOverall: scenario.quality.overall,
    qualityItems: [...scenario.quality.customer, ...scenario.quality.coach].map((item) => ({
      id: item.id,
      status: item.status,
      detail: item.detail,
    })),
    mealObservations: scenario.mealObservations,
    customerVoice: scenario.customerVoice,
    signals: scenario.decisionContext.signals.map((item) => ({
      key: item.key,
      category: item.category,
      severity: item.severity,
    })),
    dailyNutritionAssessment: scenario.decisionContext.dailyNutritionAssessment,
    mealFollowUpBudget: scenario.decisionContext.mealFollowUpBudget,
    mealClarificationCount: countMealClarifications(scenario.output),
    topPriorities: scenario.decisionContext.priorities.map((item) => ({
      rank: item.rank,
      signalKey: item.signalKey,
      reason: item.reason,
      tomorrowFocusSubject: item.tomorrowFocusSubject,
    })),
    pendingFollowUps: scenario.decisionContext.pendingFollowUps,
    appliedFollowUps: scenario.output.coach.follow_ups,
    rawCustomerOutput: scenario.rawOutput.customer,
    appliedCustomerOutput: scenario.output.customer,
    rawCoachOutput: scenario.rawOutput.coach,
    appliedCoachOutput: scenario.output.coach,
    decisionContext: {
      finalInterventionLevel: scenario.decisionContext.finalInterventionLevel,
      recurringIssue: scenario.decisionContext.recurringIssue,
      improvedIssue: scenario.decisionContext.improvedIssue,
      coachAttention: scenario.decisionContext.coachAttention,
      goalContext: scenario.decisionContext.goalContext,
      outcomeAssessment: scenario.decisionContext.outcomeAssessment,
      priorities: scenario.decisionContext.priorities,
    },
    imageResizeMetadata: scenario.imageResizeMetadata,
  });
}

const DETAILED_SCENARIOS = new Set<CoachingAiFixtureScenario>([
  "D_hunger_shake_fried_rice",
  "I_baseline_only_fat_loss",
  "J_second_measurement_improving",
  "K_weight_down_muscle_loss",
  "L_recomposition",
  "N_two_periods_flat",
]);

async function main() {
  for (const envFile of [
    process.env.COACHING_EVAL_ENV_FILE,
    ".env.vercel.eval",
    ".env.local",
    ".env.vercel.production.local",
  ]) {
    if (!envFile) continue;
    try {
      loadEnvFile(resolve(process.cwd(), envFile));
    } catch {
      // optional
    }
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log("SKIP: OPENAI_API_KEY unavailable locally.");
    process.exit(0);
  }

  const scenariosEnv = process.env.COACHING_EVAL_SCENARIOS?.trim();
  const scenarios = scenariosEnv
    ? (scenariosEnv.split(",").map((item) => item.trim()).filter(Boolean) as CoachingAiFixtureScenario[])
    : undefined;

  console.log(
    `COACHING_EVAL_START full_pipeline scenarios=${JSON.stringify(
      scenarios ?? ["A", "B", "C", "D", "E", "F", "G", "H"],
    )}`,
  );
  const report = await runCoachingAiControlledEvaluation({ scenarios });
  const outPath = resolve(process.cwd(), ".tmp-coaching-ai-evaluation-report.json");
  writeFileSync(outPath, JSON.stringify({ ok: true, report }, null, 2));

  console.log("COACHING_EVAL_REPORT_START");
  for (const scenario of report.scenarios) {
    printRegressionScenario(scenario);
    if (DETAILED_SCENARIOS.has(scenario.scenario)) {
      printDetailedScenario(scenario);
    }
  }
  console.log(
    `COACHING_EVAL_SUMMARY:${JSON.stringify({
      ranAt: report.ranAt,
      model: report.model,
      scenarioCount: report.scenarios.length,
      scenarios: report.scenarios.map((item) => item.scenario),
      averageEstimatedCostUsd: report.averageEstimatedCostUsd,
      costProjection: report.costProjection,
      nutritionLevels: Object.fromEntries(
        report.scenarios.map((item) => [
          item.scenario,
          item.decisionContext.dailyNutritionAssessment.level,
        ]),
      ),
    })}`,
  );
  console.log("COACHING_EVAL_REPORT_END");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
