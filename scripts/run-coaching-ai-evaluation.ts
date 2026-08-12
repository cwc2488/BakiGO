import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

function printRegressionScenario(
  scenario: Awaited<ReturnType<typeof runCoachingAiControlledEvaluation>>["scenarios"][number],
) {
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
    customer: {
      encouragement: scenario.output.customer.encouragement,
      today_feedback: scenario.output.customer.today_feedback,
      adjustment_priorities: scenario.output.customer.adjustment_priorities,
      tomorrow_focus: scenario.output.customer.tomorrow_focus,
      customer_voice_response: scenario.output.customer.customer_voice_response,
      follow_up_for_tomorrow: scenario.output.customer.follow_up_for_tomorrow,
    },
    coach: {
      daily_summary: scenario.output.coach.daily_summary,
      proposed_intervention_level: scenario.output.coach.proposed_intervention_level,
      follow_ups: scenario.output.coach.follow_ups,
    },
  };
  console.log(`COACHING_EVAL_SCENARIO:${scenario.scenario}:${JSON.stringify(compact)}`);
}

function printDetailedD(
  scenario: Awaited<ReturnType<typeof runCoachingAiControlledEvaluation>>["scenarios"][number],
) {
  printChunkedBase64("COACHING_EVAL_D_FULL", {
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
    mealObservations: scenario.mealObservations,
    customerVoice: scenario.customerVoice,
    topPriorities: scenario.decisionContext.priorities.map((item) => ({
      rank: item.rank,
      signalKey: item.signalKey,
      reason: item.reason,
      tomorrowFocusSubject: item.tomorrowFocusSubject,
    })),
    pendingFollowUps: scenario.decisionContext.pendingFollowUps,
    appliedFollowUps: scenario.output.coach.follow_ups,
    rawOutput: scenario.rawOutput,
    appliedCustomerOutput: scenario.output.customer,
    appliedCoachOutput: scenario.output.coach,
    decisionContext: {
      finalInterventionLevel: scenario.decisionContext.finalInterventionLevel,
      recurringIssue: scenario.decisionContext.recurringIssue,
      improvedIssue: scenario.decisionContext.improvedIssue,
      coachAttention: scenario.decisionContext.coachAttention,
    },
  });
}

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
    ? (scenariosEnv.split(",").map((item) => item.trim()).filter(Boolean) as Array<
        "A_normal" | "B_breakfast_deviation" | "C_watch_pattern" | "D_hunger_shake_fried_rice"
      >)
    : undefined;

  console.log(
    `COACHING_EVAL_START full_pipeline scenarios=${JSON.stringify(scenarios ?? ["A", "B", "C", "D"])}`,
  );
  const report = await runCoachingAiControlledEvaluation({ scenarios });
  const outPath = resolve(process.cwd(), ".tmp-coaching-ai-evaluation-report.json");
  writeFileSync(outPath, JSON.stringify({ ok: true, report }, null, 2));

  console.log("COACHING_EVAL_REPORT_START");
  for (const scenario of report.scenarios) {
    if (scenario.scenario === "D_hunger_shake_fried_rice") {
      printDetailedD(scenario);
    } else {
      printRegressionScenario(scenario);
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
    })}`,
  );
  console.log("COACHING_EVAL_REPORT_END");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
