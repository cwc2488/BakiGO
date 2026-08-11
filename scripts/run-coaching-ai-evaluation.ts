import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCoachingAiControlledEvaluation } from "../src/lib/coaching/ai/run-coaching-ai-evaluation";

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log("SKIP: OPENAI_API_KEY unavailable locally.");
    console.log(
      "Run on Vercel server instead: POST /api/coaching/internal/eval-fixtures with Authorization: Bearer $COACHING_AI_EVAL_SECRET",
    );
    process.exit(0);
  }

  const report = await runCoachingAiControlledEvaluation();
  const outPath = resolve(process.cwd(), ".tmp-coaching-ai-evaluation-report.json");
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
