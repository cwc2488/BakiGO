/**
 * Apply LOSE2KG-01 migration 078 (idempotent, additive).
 *
 *   npx vercel env run -e production -- node scripts/apply-lose2kg-migration.mjs
 *   # or with env already present:
 *   node scripts/apply-lose2kg-migration.mjs
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

  const sql = readFileSync("supabase/migrations/078_lose2kg_v1.sql", "utf8");
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
      console.log(
        JSON.stringify({
          ok: false,
          via: "management_api",
          status: resp.status,
          body: text.slice(0, 2000),
        }),
      );
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, via: "management_api", projectRef }));
    return;
  }

  if (!serviceKey) {
    console.log(JSON.stringify({ ok: false, error: "missing_service_role_or_access_token" }));
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("lose2kg_periods").select("id").limit(1);
  if (error) {
    console.log(
      JSON.stringify({
        ok: false,
        via: "service_role_probe",
        error: error.message,
        hint: "Apply 078_lose2kg_v1.sql via Supabase SQL Editor or SUPABASE_ACCESS_TOKEN.",
      }),
    );
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, via: "service_role_probe", projectRef }));
}

main().catch((error) => {
  console.log(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exit(1);
});
