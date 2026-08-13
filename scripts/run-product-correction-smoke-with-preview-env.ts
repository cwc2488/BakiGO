/**
 * Runner: load .env.preview.local into process.env (skip placeholders), then run smoke.
 * Never prints secret values.
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

function loadPreviewEnv(path: string) {
  if (!existsSync(path)) {
    throw new Error(`missing_env_file:${path}`);
  }
  const report: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const placeholder =
      !value || value === "[SENSITIVE]" || value.startsWith("[SENSITIVE]") || value.length < 20;
    if (["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_AUTOMATION_BYPASS_SECRET"].includes(key)) {
      report[key] = placeholder ? "placeholder_or_short" : "usable";
    }
    if (!placeholder) {
      process.env[key] = value;
    }
  }
  console.log(JSON.stringify({ previewEnvLoad: report }, null, 2));
}

const envPath = ".env.preview.local";
loadPreviewEnv(envPath);
process.env.PREVIEW_BASE_URL =
  process.env.PREVIEW_BASE_URL || "https://baki-hj4bn3fjv-baki-go.vercel.app";

const result = spawnSync(
  "npx",
  ["tsx", "scripts/coaching-product-correction-preview-smoke.ts"],
  { stdio: "inherit", env: process.env },
);

try {
  unlinkSync(envPath);
  console.log("deleted .env.preview.local");
} catch {
  // ignore
}

process.exit(result.status ?? 1);
