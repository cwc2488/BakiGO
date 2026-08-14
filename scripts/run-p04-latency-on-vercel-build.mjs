/**
 * Optional Preview-only build hook for P0.4 latency squeeze benchmark.
 * Do NOT leave wired in production build.
 *
 *   RUN_P04_LATENCY_BENCH=1 node scripts/run-p04-latency-on-vercel-build.mjs
 */
import { execSync } from "node:child_process";

if (process.env.RUN_P04_LATENCY_BENCH !== "1") {
  process.exit(0);
}

const missing = ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"].filter(
  (key) => {
    const value = process.env[key]?.trim();
    return !value || value.includes("SENSITIVE");
  },
);
if (missing.length > 0) {
  console.log(`P04_BENCH:${JSON.stringify({ ok: false, error: "missing_env", missing })}`);
  process.exit(0);
}

console.log("P04_BENCH_START");
execSync("npx tsx scripts/run-p04-preview-latency-benchmark.ts", {
  stdio: "inherit",
  env: process.env,
});
console.log("P04_BENCH_END");
