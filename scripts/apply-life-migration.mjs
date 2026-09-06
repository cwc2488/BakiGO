/**
 * Apply Baki Life migration 076 to Supabase (idempotent).
 *
 *   npx vercel env run -e production -- node scripts/apply-life-migration.mjs
 *   # or with env already present:
 *   node scripts/apply-life-migration.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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
    /* optional */
  }
  return env;
}

function isPlaceholder(value) {
  if (!value) return true;
  const t = String(value).trim();
  return t === "[SENSITIVE]" || t.startsWith("[SENSITIVE]") || t.length < 20;
}

function pick(...candidates) {
  for (const v of candidates) {
    if (!isPlaceholder(v)) return v;
  }
  return undefined;
}

async function main() {
  const productionEnv = loadEnvFile(".env.production.local");
  const localEnv = loadEnvFile(".env.local");
  const url = pick(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    productionEnv.NEXT_PUBLIC_SUPABASE_URL,
  );
  const serviceKey = pick(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    localEnv.SUPABASE_SERVICE_ROLE_KEY,
    productionEnv.SUPABASE_SERVICE_ROLE_KEY,
  );
  const accessToken = pick(
    process.env.SUPABASE_ACCESS_TOKEN,
    localEnv.SUPABASE_ACCESS_TOKEN,
    productionEnv.SUPABASE_ACCESS_TOKEN,
  );

  if (!url) {
    console.log(JSON.stringify({ ok: false, error: "missing_supabase_url" }));
    process.exit(1);
  }

  const sql = readFileSync("supabase/migrations/076_baki_life_v1.sql", "utf8");
  const projectRef = new URL(url).hostname.split(".")[0];

  if (accessToken) {
    const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.log(JSON.stringify({ ok: false, via: "management_api", status: resp.status, body: text.slice(0, 800) }));
      process.exit(1);
    }
  } else if (serviceKey) {
    // Service role cannot run arbitrary DDL via PostgREST; require management API.
    console.log(
      JSON.stringify({
        ok: false,
        error: "ddl_requires_supabase_access_token",
        hint: "Set SUPABASE_ACCESS_TOKEN to run 076 via Management API",
      }),
    );
    process.exit(1);
  } else {
    console.log(JSON.stringify({ ok: false, error: "missing_supabase_credentials" }));
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tables = [
    "life_accounts",
    "life_categories",
    "life_goals",
    "life_transactions",
    "life_snapshots",
    "life_snapshot_balances",
    "life_preferences",
  ];
  const verified = {};
  if (serviceKey) {
    for (const table of tables) {
      const { error } = await supabase.from(table).select("*").limit(0);
      verified[table] = !error;
    }
  }

  console.log(JSON.stringify({ ok: true, projectRef, verified }, null, 2));
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
