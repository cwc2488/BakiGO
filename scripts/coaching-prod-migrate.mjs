import { readFileSync, writeFileSync } from "node:fs";

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
    env.__loadedFrom = path;
    env.__keyCount = String(Object.keys(env).filter((key) => !key.startsWith("__")).length);
  } catch (error) {
    env.__loadError = error instanceof Error ? error.message : String(error);
  }
  return env;
}

function isPlaceholderSecret(value) {
  return !value || value === "[SENSITIVE]" || value.length < 20;
}

function pickEnvValue(...candidates) {
  for (const value of candidates) {
    if (!isPlaceholderSecret(value)) {
      return value;
    }
  }
  return undefined;
}

function resolveEnv() {
  const productionEnv = loadEnvFile(".env.production.local");
  const localEnv = loadEnvFile(".env.local");
  const url = pickEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    productionEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
  );
  const serviceKey = pickEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    productionEnv.SUPABASE_SERVICE_ROLE_KEY,
    localEnv.SUPABASE_SERVICE_ROLE_KEY,
  );
  const accessToken = pickEnvValue(
    process.env.SUPABASE_ACCESS_TOKEN,
    productionEnv.SUPABASE_ACCESS_TOKEN,
    localEnv.SUPABASE_ACCESS_TOKEN,
  );
  const anonKey = pickEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    productionEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return {
    url,
    serviceKey,
    accessToken,
    anonKey,
    debug: {
      cwd: process.cwd(),
      productionEnvKeys: productionEnv.__keyCount ?? null,
      productionEnvLoadError: productionEnv.__loadError ?? null,
      localEnvKeys: localEnv.__keyCount ?? null,
      localEnvLoadError: localEnv.__loadError ?? null,
      processEnvHasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      processEnvHasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasUrlKeyInProductionEnv: Object.prototype.hasOwnProperty.call(productionEnv, "NEXT_PUBLIC_SUPABASE_URL"),
      hasServiceKeyInProductionEnv: Object.prototype.hasOwnProperty.call(productionEnv, "SUPABASE_SERVICE_ROLE_KEY"),
      urlLength: url?.length ?? 0,
      serviceKeyLength: serviceKey?.length ?? 0,
      urlStartsWithHttp: !!url?.startsWith("http"),
    },
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
  return { ok: resp.ok, status: resp.status, body: text.slice(0, 1200) };
}

async function tableExists(supabase, name) {
  const { error } = await supabase.from(name).select("*").limit(0);
  if (error) return { exists: false, code: error.code, message: error.message };
  return { exists: true };
}

async function columnExists(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(0);
  if (error) return { exists: false, message: error.message };
  return { exists: true };
}

async function rpcExists(supabase, name) {
  const { data, error } = await supabase.rpc(name, { portal_token: "__invalid__" });
  if (error?.code === "PGRST202") return { exists: false, message: error.message };
  return { exists: true, sample: data };
}

async function verify027(supabase) {
  const tables = [
    "coaching_enrollments",
    "coaching_daily_logs",
    "coaching_meal_entries",
    "coaching_meal_photos",
  ];
  const tableChecks = {};
  for (const table of tables) {
    tableChecks[table] = await tableExists(supabase, table);
  }
  const rpcCheck = await rpcExists(supabase, "resolve_coaching_portal_context");
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  const coachingBucket = (buckets ?? []).find((bucket) => bucket.id === "coaching-meal-photos");
  return {
    tables: tableChecks,
    allTablesExist: tables.every((table) => tableChecks[table]?.exists),
    rpc: rpcCheck,
    storage: {
      error: bucketError?.message ?? null,
      bucket: coachingBucket
        ? {
            id: coachingBucket.id,
            public: coachingBucket.public,
            fileSizeLimit: coachingBucket.file_size_limit,
          }
        : null,
    },
  };
}

async function verify028(supabase) {
  const bedtime = await columnExists(supabase, "coaching_daily_logs", "sleep_bedtime");
  const wake = await columnExists(supabase, "coaching_daily_logs", "sleep_wake_time");
  return {
    sleepBedtime: bedtime,
    sleepWakeTime: wake,
    ok: bedtime.exists && wake.exists,
  };
}

async function verify029(supabase) {
  const tables = [
    "coaching_coach_directives",
    "coaching_ai_outputs",
    "coaching_generation_jobs",
    "ai_llm_call_log",
  ];
  const tableChecks = {};
  for (const table of tables) {
    tableChecks[table] = await tableExists(supabase, table);
  }
  return {
    tables: tableChecks,
    allTablesExist: tables.every((table) => tableChecks[table]?.exists),
  };
}

async function verify030(supabase) {
  const { error: reclaimError } = await supabase.rpc("reclaim_stale_coaching_generation_jobs", {
    p_stale_after_minutes: 15,
  });
  const reclaimExists = reclaimError?.code !== "PGRST202";

  const { error: claimError } = await supabase.rpc("claim_coaching_generation_jobs", {
    p_limit: 0,
    p_locked_by: "migrate-verify",
  });
  const claimExists = claimError?.code !== "PGRST202";

  return {
    reclaim: { exists: reclaimExists, message: reclaimError?.message ?? null },
    claim: { exists: claimExists, message: claimError?.message ?? null },
    ok: reclaimExists && claimExists,
  };
}

async function verify031(supabase) {
  const table = await tableExists(supabase, "coaching_coach_actions");
  if (!table.exists) {
    return { table, columns: {}, ok: false };
  }
  const columns = {};
  for (const column of [
    "action_type",
    "status",
    "note",
    "related_reason_codes",
    "evidence_refs",
    "is_material",
    "resolved_at",
    "owner_member_id",
  ]) {
    columns[column] = await columnExists(supabase, "coaching_coach_actions", column);
  }
  return {
    table,
    columns,
    ok: table.exists && Object.values(columns).every((item) => item.exists),
  };
}

async function verify032(supabase) {
  const growth = await tableExists(supabase, "growth_opportunities");
  const checkins = await tableExists(supabase, "customer_experience_checkins");
  const referralDraft = await tableExists(supabase, "referral_opportunities");
  const growthColumns = {};
  const checkinColumns = {};
  if (growth.exists) {
    for (const column of [
      "fingerprint",
      "primary_growth_path",
      "outcome_band_snapshot",
      "experience_band_snapshot",
      "source_checkin_id",
      "owner_member_id",
    ]) {
      growthColumns[column] = await columnExists(supabase, "growth_opportunities", column);
    }
  }
  if (checkins.exists) {
    for (const column of [
      "outcome_perception",
      "coach_helpfulness",
      "experience_satisfaction",
      "recommendation_willingness",
      "most_felt_change_text",
      "most_felt_change_consent",
    ]) {
      checkinColumns[column] = await columnExists(supabase, "customer_experience_checkins", column);
    }
  }
  return {
    growth,
    checkins,
    referralDraftAbsent: !referralDraft.exists,
    growthColumns,
    checkinColumns,
    ok:
      growth.exists &&
      checkins.exists &&
      Object.values(growthColumns).every((item) => item.exists) &&
      Object.values(checkinColumns).every((item) => item.exists),
  };
}

async function applyMigration({ migration, sqlPath, token, projectRef }) {
  const sql = readFileSync(sqlPath, "utf8");
  const attempt = await runSqlViaManagementApi(sql, token, projectRef);
  return { migration, ...attempt };
}

async function main() {
  const mode = process.argv[2] ?? "verify";
  const { url, serviceKey, accessToken, anonKey, debug } = resolveEnv();
  const out = {
    mode,
    projectRef: null,
    ok: false,
    env: {
      hasUrl: !!url?.startsWith("http"),
      hasServiceKey: !!serviceKey && serviceKey.length > 20,
      hasAnonKey: !!anonKey && anonKey.length > 20,
      hasAccessToken: !!accessToken && accessToken.length > 20,
      debug,
    },
    migrations: {},
  };

  if (!url?.startsWith("http")) {
    out.error = "invalid_supabase_url";
    writeFileSync(".tmp-coaching-prod-migrate-result.json", JSON.stringify(out, null, 2));
    process.exit(1);
  }
  out.projectRef = new URL(url).hostname.split(".")[0];

  const { createClient } = await import("@supabase/supabase-js");
  const clientKey = serviceKey ?? anonKey;
  if (!clientKey) {
    out.error = "missing_supabase_service_or_anon_key";
    writeFileSync(".tmp-coaching-prod-migrate-result.json", JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const supabase = createClient(url, clientKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  out.migrations["027"] = await verify027(supabase);
  out.migrations["028"] = await verify028(supabase);
  out.migrations["029"] = await verify029(supabase);
  out.migrations["030"] = await verify030(supabase);
  out.migrations["031"] = await verify031(supabase);
  out.migrations["032"] = await verify032(supabase);

  if (mode === "apply") {
    if (!serviceKey && !accessToken) {
      out.error = "apply_requires_service_role_key_or_supabase_access_token";
      writeFileSync(".tmp-coaching-prod-migrate-result.json", JSON.stringify(out, null, 2));
      process.exit(1);
    }

    const tokens = [
      ["access_token", accessToken],
      ["service_role_key", serviceKey],
    ].filter(([, token]) => token && token.length > 20);

    out.applyAttempts = [];

    if (!out.migrations["027"].allTablesExist) {
      for (const [label, token] of tokens) {
        const attempt = await applyMigration({
          migration: "027_coaching_v1.sql",
          sqlPath: "supabase/migrations/027_coaching_v1.sql",
          token,
          projectRef: out.projectRef,
        });
        out.applyAttempts.push({ label, ...attempt });
        if (attempt.ok) break;
      }
      out.migrations["027"] = await verify027(supabase);
    }

    if (out.migrations["027"].allTablesExist && !out.migrations["028"].ok) {
      for (const [label, token] of tokens) {
        const attempt = await applyMigration({
          migration: "028_coaching_sleep_times.sql",
          sqlPath: "supabase/migrations/028_coaching_sleep_times.sql",
          token,
          projectRef: out.projectRef,
        });
        out.applyAttempts.push({ label, ...attempt });
        if (attempt.ok) break;
      }
      out.migrations["028"] = await verify028(supabase);
    }

    if (out.migrations["027"].allTablesExist && out.migrations["028"].ok && !out.migrations["029"].allTablesExist) {
      for (const [label, token] of tokens) {
        const attempt = await applyMigration({
          migration: "029_coaching_ai_phase2a.sql",
          sqlPath: "supabase/migrations/029_coaching_ai_phase2a.sql",
          token,
          projectRef: out.projectRef,
        });
        out.applyAttempts.push({ label, ...attempt });
        if (attempt.ok) break;
      }
      out.migrations["029"] = await verify029(supabase);
    }

    if (out.migrations["029"].allTablesExist && !out.migrations["030"].ok) {
      for (const [label, token] of tokens) {
        const attempt = await applyMigration({
          migration: "030_coaching_generation_job_claim.sql",
          sqlPath: "supabase/migrations/030_coaching_generation_job_claim.sql",
          token,
          projectRef: out.projectRef,
        });
        out.applyAttempts.push({ label, ...attempt });
        if (attempt.ok) break;
      }
      out.migrations["030"] = await verify030(supabase);
    }

    if (
      out.migrations["029"].allTablesExist &&
      out.migrations["030"].ok &&
      !out.migrations["031"].ok
    ) {
      for (const [label, token] of tokens) {
        const attempt = await applyMigration({
          migration: "031_coaching_coach_actions.sql",
          sqlPath: "supabase/migrations/031_coaching_coach_actions.sql",
          token,
          projectRef: out.projectRef,
        });
        out.applyAttempts.push({ label, ...attempt });
        if (attempt.ok) break;
      }
      out.migrations["031"] = await verify031(supabase);
    }

    if (
      out.migrations["031"].ok &&
      !out.migrations["032"].ok
    ) {
      for (const [label, token] of tokens) {
        const attempt = await applyMigration({
          migration: "032_growth_opportunities.sql",
          sqlPath: "supabase/migrations/032_growth_opportunities.sql",
          token,
          projectRef: out.projectRef,
        });
        out.applyAttempts.push({ label, ...attempt });
        if (attempt.ok) break;
      }
      out.migrations["032"] = await verify032(supabase);
    }
  }

  out.ok =
    out.migrations["027"].allTablesExist &&
    out.migrations["027"].rpc?.exists &&
    out.migrations["028"].ok &&
    out.migrations["029"].allTablesExist &&
    out.migrations["030"].ok &&
    out.migrations["031"].ok &&
    out.migrations["032"].ok &&
    (serviceKey
      ? !!out.migrations["027"].storage?.bucket && out.migrations["027"].storage.bucket.public === false
      : true);

  writeFileSync(".tmp-coaching-prod-migrate-result.json", JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main().catch((error) => {
  writeFileSync(
    ".tmp-coaching-prod-migrate-result.json",
    JSON.stringify({ ok: false, error: error.message }, null, 2),
  );
  process.exit(1);
});
