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
  if (!value) return true;
  const trimmed = String(value).trim();
  if (trimmed === "[SENSITIVE]" || trimmed.startsWith("[SENSITIVE]")) return true;
  return trimmed.length < 20;
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
  const previewEnv = loadEnvFile(".env.preview.local");
  const localEnv = loadEnvFile(".env.local");
  // Prefer process env → preview → local → production (production may be redacted placeholders).
  const url = pickEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    previewEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    productionEnv.NEXT_PUBLIC_SUPABASE_URL,
  );
  const serviceKey = pickEnvValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    previewEnv.SUPABASE_SERVICE_ROLE_KEY,
    localEnv.SUPABASE_SERVICE_ROLE_KEY,
    productionEnv.SUPABASE_SERVICE_ROLE_KEY,
  );
  const accessToken = pickEnvValue(
    process.env.SUPABASE_ACCESS_TOKEN,
    previewEnv.SUPABASE_ACCESS_TOKEN,
    localEnv.SUPABASE_ACCESS_TOKEN,
    productionEnv.SUPABASE_ACCESS_TOKEN,
  );
  const anonKey = pickEnvValue(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    previewEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    productionEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
      previewEnvKeys: previewEnv.__keyCount ?? null,
      previewEnvLoadError: previewEnv.__loadError ?? null,
      previewEnvFilePresent: !previewEnv.__loadError,
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

async function verify033(supabase) {
  const shares = await tableExists(supabase, "growth_shares");
  const attributions = await tableExists(supabase, "growth_referral_attributions");
  const shareColumns = {};
  const attributionColumns = {};
  if (shares.exists) {
    for (const column of [
      "owner_member_id",
      "introducer_customer_id",
      "share_type",
      "token_hash",
      "status",
      "consent_snapshot_json",
      "public_display_json",
      "benefit_json",
    ]) {
      shareColumns[column] = await columnExists(supabase, "growth_shares", column);
    }
  }
  if (attributions.exists) {
    for (const column of [
      "owner_member_id",
      "share_id",
      "introducer_customer_id",
      "introduced_customer_id",
      "status",
      "lead_display_name",
      "lead_phone",
      "linked_existing_customer",
    ]) {
      attributionColumns[column] = await columnExists(supabase, "growth_referral_attributions", column);
    }
  }
  return {
    shares,
    attributions,
    shareColumns,
    attributionColumns,
    ok:
      shares.exists &&
      attributions.exists &&
      Object.values(shareColumns).every((item) => item.exists) &&
      Object.values(attributionColumns).every((item) => item.exists),
  };
}

async function verify034(supabase) {
  const plannedEnd = await columnExists(supabase, "coaching_enrollments", "planned_end_at");
  const mealSlot = await columnExists(supabase, "coaching_coach_directives", "meal_slot");
  const effectiveUntil = await columnExists(supabase, "coaching_coach_directives", "effective_until");
  const status = await columnExists(supabase, "coaching_coach_directives", "status");
  const customerVisible = await columnExists(supabase, "coaching_coach_directives", "customer_visible");
  return {
    plannedEnd,
    mealSlot,
    effectiveUntil,
    status,
    customerVisible,
    ok:
      plannedEnd.exists &&
      mealSlot.exists &&
      effectiveUntil.exists &&
      status.exists &&
      customerVisible.exists,
  };
}

function log(line) {
  console.log(line);
}

function logStatus(migration, status, detail = "") {
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[${migration}] ${status}${suffix}`);
}

function writeResult(out) {
  const path = ".tmp-coaching-prod-migrate-result.json";
  writeFileSync(path, JSON.stringify(out, null, 2));
  log(`Wrote result: ${path}`);
}

async function applyMigration({ migration, sqlPath, token, projectRef }) {
  const sql = readFileSync(sqlPath, "utf8");
  const attempt = await runSqlViaManagementApi(sql, token, projectRef);
  return { migration, ...attempt };
}

async function main() {
  const mode = process.argv[2] ?? "verify";
  if (mode !== "verify" && mode !== "apply") {
    log("Usage: node scripts/coaching-prod-migrate.mjs <verify|apply>");
    process.exit(1);
  }

  log(`coaching-prod-migrate mode=${mode}`);
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

  log(
    `env: url=${out.env.hasUrl ? "usable" : "missing/placeholder"} serviceKey=${
      out.env.hasServiceKey ? "usable" : "missing/placeholder"
    } anonKey=${out.env.hasAnonKey ? "usable" : "missing/placeholder"} accessToken=${
      out.env.hasAccessToken ? "usable" : "missing/placeholder"
    } previewEnvFile=${debug.previewEnvFilePresent ? "present" : "missing"}`,
  );

  if (!url?.startsWith("http")) {
    out.error = "invalid_supabase_url";
    log(`FAILED: ${out.error}`);
    writeResult(out);
    process.exit(1);
  }
  out.projectRef = new URL(url).hostname.split(".")[0];
  log(`target projectRef=${out.projectRef}`);

  const { createClient } = await import("@supabase/supabase-js");
  const clientKey = serviceKey ?? anonKey;
  if (!clientKey) {
    out.error = "missing_supabase_service_or_anon_key";
    log(`FAILED: ${out.error}`);
    writeResult(out);
    process.exit(1);
  }

  const supabase = createClient(url, clientKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const verifiers = [
    ["027", verify027, (r) => r.allTablesExist && r.rpc?.exists],
    ["028", verify028, (r) => r.ok],
    ["029", verify029, (r) => r.allTablesExist],
    ["030", verify030, (r) => r.ok],
    ["031", verify031, (r) => r.ok],
    ["032", verify032, (r) => r.ok],
    ["033", verify033, (r) => r.ok],
    ["034", verify034, (r) => r.ok],
  ];

  for (const [id, verifyFn, isOk] of verifiers) {
    logStatus(id, "checking");
    out.migrations[id] = await verifyFn(supabase);
    logStatus(id, isOk(out.migrations[id]) ? "verified" : "missing");
  }

  if (mode === "apply") {
    if (!serviceKey && !accessToken) {
      out.error = "apply_requires_service_role_key_or_supabase_access_token";
      log(`FAILED: ${out.error}`);
      log("Hint: Management API apply needs SUPABASE_ACCESS_TOKEN (or usable service role).");
      log("Manual SQL path: supabase/migrations/034_coaching_product_correction.sql");
      writeResult(out);
      process.exit(1);
    }

    const tokens = [
      ["access_token", accessToken],
      ["service_role_key", serviceKey],
    ].filter(([, token]) => token && token.length > 20);

    out.applyAttempts = [];

    const applyIfNeeded = async ({ id, needed, migration, sqlPath }) => {
      if (!needed) {
        logStatus(id, "skipped", "already verified");
        return;
      }
      logStatus(id, "applying", migration);
      let applied = false;
      for (const [label, token] of tokens) {
        const attempt = await applyMigration({ migration, sqlPath, token, projectRef: out.projectRef });
        out.applyAttempts.push({ label, ...attempt });
        logStatus(id, attempt.ok ? "applied" : "apply_failed", `${label} status=${attempt.status}`);
        if (attempt.ok) {
          applied = true;
          break;
        }
      }
      if (!applied) {
        logStatus(id, "failed", "no successful apply attempt");
      }
    };

    await applyIfNeeded({
      id: "027",
      needed: !out.migrations["027"].allTablesExist,
      migration: "027_coaching_v1.sql",
      sqlPath: "supabase/migrations/027_coaching_v1.sql",
    });
    out.migrations["027"] = await verify027(supabase);

    await applyIfNeeded({
      id: "028",
      needed: out.migrations["027"].allTablesExist && !out.migrations["028"].ok,
      migration: "028_coaching_sleep_times.sql",
      sqlPath: "supabase/migrations/028_coaching_sleep_times.sql",
    });
    out.migrations["028"] = await verify028(supabase);
    logStatus("028", out.migrations["028"].ok ? "verified" : "missing", "post-apply check");

    await applyIfNeeded({
      id: "029",
      needed: out.migrations["027"].allTablesExist && out.migrations["028"].ok && !out.migrations["029"].allTablesExist,
      migration: "029_coaching_ai_phase2a.sql",
      sqlPath: "supabase/migrations/029_coaching_ai_phase2a.sql",
    });
    out.migrations["029"] = await verify029(supabase);
    logStatus("029", out.migrations["029"].allTablesExist ? "verified" : "missing", "post-apply check");

    await applyIfNeeded({
      id: "030",
      needed: out.migrations["029"].allTablesExist && !out.migrations["030"].ok,
      migration: "030_coaching_generation_job_claim.sql",
      sqlPath: "supabase/migrations/030_coaching_generation_job_claim.sql",
    });
    out.migrations["030"] = await verify030(supabase);
    logStatus("030", out.migrations["030"].ok ? "verified" : "missing", "post-apply check");

    await applyIfNeeded({
      id: "031",
      needed: out.migrations["029"].allTablesExist && out.migrations["030"].ok && !out.migrations["031"].ok,
      migration: "031_coaching_coach_actions.sql",
      sqlPath: "supabase/migrations/031_coaching_coach_actions.sql",
    });
    out.migrations["031"] = await verify031(supabase);
    logStatus("031", out.migrations["031"].ok ? "verified" : "missing", "post-apply check");

    await applyIfNeeded({
      id: "032",
      needed: out.migrations["031"].ok && !out.migrations["032"].ok,
      migration: "032_growth_opportunities.sql",
      sqlPath: "supabase/migrations/032_growth_opportunities.sql",
    });
    out.migrations["032"] = await verify032(supabase);
    logStatus("032", out.migrations["032"].ok ? "verified" : "missing", "post-apply check");

    await applyIfNeeded({
      id: "033",
      needed: out.migrations["032"].ok && !out.migrations["033"].ok,
      migration: "033_growth_shares_referrals.sql",
      sqlPath: "supabase/migrations/033_growth_shares_referrals.sql",
    });
    out.migrations["033"] = await verify033(supabase);
    logStatus("033", out.migrations["033"].ok ? "verified" : "missing", "post-apply check");

    await applyIfNeeded({
      id: "034",
      needed: out.migrations["033"].ok && !out.migrations["034"].ok,
      migration: "034_coaching_product_correction.sql",
      sqlPath: "supabase/migrations/034_coaching_product_correction.sql",
    });
    out.migrations["034"] = await verify034(supabase);
    logStatus("034", out.migrations["034"].ok ? "verified" : "missing", "post-apply check");
  }

  out.ok =
    out.migrations["027"].allTablesExist &&
    out.migrations["027"].rpc?.exists &&
    out.migrations["028"].ok &&
    out.migrations["029"].allTablesExist &&
    out.migrations["030"].ok &&
    out.migrations["031"].ok &&
    out.migrations["032"].ok &&
    out.migrations["033"].ok &&
    out.migrations["034"].ok &&
    (serviceKey
      ? !!out.migrations["027"].storage?.bucket && out.migrations["027"].storage.bucket.public === false
      : true);

  log(
    `034 columns: planned_end_at=${out.migrations["034"].plannedEnd?.exists} meal_slot=${out.migrations["034"].mealSlot?.exists} effective_until=${out.migrations["034"].effectiveUntil?.exists} status=${out.migrations["034"].status?.exists} customer_visible=${out.migrations["034"].customerVisible?.exists}`,
  );
  log(`RESULT: ${out.ok ? "OK" : "FAILED"} (mode=${mode}, projectRef=${out.projectRef})`);
  writeResult(out);
  if (!out.ok) process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  writeFileSync(
    ".tmp-coaching-prod-migrate-result.json",
    JSON.stringify({ ok: false, error: message }, null, 2),
  );
  console.error("Wrote result: .tmp-coaching-prod-migrate-result.json");
  process.exit(1);
});
