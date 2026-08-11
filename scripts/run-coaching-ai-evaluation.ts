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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  const envFile = process.env.COACHING_EVAL_ENV_FILE ?? ".env.vercel.eval";
  const envPath = resolve(process.cwd(), envFile);
  try {
    loadEnvFile(envPath);
  } catch {
    // optional
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log("SKIP: OPENAI_API_KEY unavailable locally.");
    console.log(
      "Run on Vercel server instead: POST /api/coaching/internal/eval-fixtures with Authorization bearer secret.",
    );
    process.exit(0);
  }

  const report = await runCoachingAiControlledEvaluation();
  const outPath = resolve(process.cwd(), ".tmp-coaching-ai-evaluation-report.json");
  writeFileSync(outPath, JSON.stringify({ ok: true, report }, null, 2));

  console.log(JSON.stringify({ ok: true, scenarios: report.scenarios.length, outPath }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
