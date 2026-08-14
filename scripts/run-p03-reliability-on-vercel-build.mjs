import { execSync } from "node:child_process";
if (process.env.RUN_P03_RELIABILITY_BENCH !== "1") process.exit(0);
const missing = ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"].filter((k) => {
  const v = process.env[k]?.trim();
  return !v || v.includes("SENSITIVE");
});
if (missing.length) {
  console.log(`P03_BENCH:${JSON.stringify({ ok: false, error: "missing_env", missing })}`);
  process.exit(0);
}
console.log("P03_BENCH_START");
execSync("npx tsx scripts/run-p03-preview-reliability-benchmark.ts", { stdio: "inherit", env: process.env });
console.log("P03_BENCH_END");
