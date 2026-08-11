import { execSync } from "node:child_process";

/** One-shot controlled eval during Vercel build when RUN_COACHING_CONTROLLED_EVAL=1. */
if (process.env.RUN_COACHING_CONTROLLED_EVAL !== "1") {
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.log("COACHING_EVAL_SKIP missing OPENAI_API_KEY");
  process.exit(0);
}

execSync("npx tsx scripts/run-coaching-ai-evaluation.ts", {
  stdio: "inherit",
  env: process.env,
});
