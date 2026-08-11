/**
 * DEPRECATED for production: controlled eval build hook.
 * Phase 2c removed this from `npm run build`. Keep for optional local/manual use only:
 *   RUN_COACHING_CONTROLLED_EVAL=1 node scripts/run-coaching-eval-on-vercel-build.mjs
 * Do not re-wire into package.json build for production deploys.
 */
import { execSync } from "node:child_process";

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
