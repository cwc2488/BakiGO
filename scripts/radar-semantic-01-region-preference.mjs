import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  const env = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1]] = v;
    }
  } catch {
    // optional
  }
  return env;
}

function isPlaceholderSecret(value) {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed === "[Sensitive]" || trimmed === "[SENSITIVE]" || trimmed.startsWith("[SENSITIVE]")) {
    return true;
  }
  return trimmed.length < 20;
}

function pickEnvValue(...candidates) {
  for (const value of candidates) {
    if (!isPlaceholderSecret(value)) return value;
  }
  return undefined;
}

function resolveProductionEnv() {
  const productionEnv = {
    ...loadEnvFile("/Users/bachi/baki-go/.env.production.local"),
    ...loadEnvFile(".env.production.local"),
  };
  const previewEnv = {
    ...loadEnvFile("/Users/bachi/baki-go/.env.preview.local"),
    ...loadEnvFile(".env.preview.local"),
  };
  const localEnv = {
    ...loadEnvFile("/Users/bachi/baki-go/.env.local"),
    ...loadEnvFile(".env.local"),
  };
  return {
    url: pickEnvValue(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      productionEnv.NEXT_PUBLIC_SUPABASE_URL,
      previewEnv.NEXT_PUBLIC_SUPABASE_URL,
      localEnv.NEXT_PUBLIC_SUPABASE_URL,
    ),
    serviceKey: pickEnvValue(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      productionEnv.SUPABASE_SERVICE_ROLE_KEY,
      previewEnv.SUPABASE_SERVICE_ROLE_KEY,
      localEnv.SUPABASE_SERVICE_ROLE_KEY,
    ),
    accessToken: pickEnvValue(
      process.env.SUPABASE_ACCESS_TOKEN,
      productionEnv.SUPABASE_ACCESS_TOKEN,
      previewEnv.SUPABASE_ACCESS_TOKEN,
      localEnv.SUPABASE_ACCESS_TOKEN,
    ),
  };
}

async function runSqlViaManagementApi(sql, token, projectRef) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await resp.text();
  return { ok: resp.ok, status: resp.status, body: text.slice(0, 1500) };
}

async function main() {
  const mode = process.argv[2] ?? "verify";
  if (mode !== "verify" && mode !== "apply") {
    console.log("Usage: node scripts/radar-semantic-01-region-preference.mjs <verify|apply>");
    process.exit(1);
  }

  const { url, serviceKey, accessToken } = resolveProductionEnv();
  if (!url?.startsWith("http") || !serviceKey) {
    console.log(JSON.stringify({ ok: false, error: "missing_production_supabase_env" }));
    process.exit(1);
  }

  const projectRef = new URL(url).hostname.split(".")[0];
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const probe = await supabase.from("member_radar_region_preferences").select("member_id").limit(0);
  const exists = !probe.error;

  if (mode === "verify") {
    console.log(JSON.stringify({ ok: exists, projectRef, exists, error: probe.error?.message ?? null }));
    process.exit(exists ? 0 : 1);
  }

  if (exists) {
    console.log(JSON.stringify({ ok: true, projectRef, applied: false, reason: "already_exists" }));
    return;
  }

  if (!accessToken) {
    console.log(JSON.stringify({ ok: false, projectRef, error: "missing_supabase_access_token" }));
    process.exit(1);
  }

  const sql = readFileSync("supabase/migrations/049_radar_semantic_region_preference.sql", "utf8");
  const attempt = await runSqlViaManagementApi(sql, accessToken, projectRef);
  const verify = await supabase.from("member_radar_region_preferences").select("member_id").limit(0);
  const applied = !verify.error;
  console.log(
    JSON.stringify({
      ok: applied,
      projectRef,
      applied,
      attempt,
      verifyError: verify.error?.message ?? null,
    }),
  );
  process.exit(applied ? 0 : 1);
}

await main();
