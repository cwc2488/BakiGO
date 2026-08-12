/**
 * Phase 3d Production Gate — migrate verify/apply helper + persistence smoke.
 *
 * Preferred:
 *   npx vercel env run --environment=production -- node scripts/coaching-phase3d-prod-gate.mjs apply
 *   npx vercel env run --environment=production -- node scripts/coaching-phase3d-prod-gate.mjs smoke
 *
 * Or with real secrets in process env / .env.local (not [SENSITIVE] placeholders).
 * Writes .tmp-phase3d-prod-gate-result.json (gitignored). Does not print secrets.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";

function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1].trim()] = v;
    }
  } catch {
    // optional
  }
  return env;
}

function isPlaceholder(value) {
  return !value || value === "[SENSITIVE]" || value.length < 20;
}

function pick(...candidates) {
  for (const value of candidates) {
    if (!isPlaceholder(value)) return value;
  }
  return undefined;
}

function resolveEnv() {
  const fileEnv = {
    ...loadEnvFile(".env.local"),
    ...loadEnvFile(".env.production.local"),
  };
  return {
    url: pick(process.env.NEXT_PUBLIC_SUPABASE_URL, fileEnv.NEXT_PUBLIC_SUPABASE_URL),
    serviceKey: pick(process.env.SUPABASE_SERVICE_ROLE_KEY, fileEnv.SUPABASE_SERVICE_ROLE_KEY),
    accessToken: pick(process.env.SUPABASE_ACCESS_TOKEN, fileEnv.SUPABASE_ACCESS_TOKEN),
    openaiKey: pick(process.env.OPENAI_API_KEY, fileEnv.OPENAI_API_KEY),
  };
}

async function runSql(sql, token, projectRef) {
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

async function tableExists(supabase, name) {
  const { error } = await supabase.from(name).select("*").limit(0);
  if (error?.code === "PGRST205" || error?.message?.includes("does not exist")) {
    return { exists: false, code: error.code, message: error.message };
  }
  return { exists: true, code: error?.code ?? null, message: error?.message ?? null };
}

async function verifyPre031(supabase) {
  const checks = {};
  for (const table of [
    "coaching_enrollments",
    "coaching_daily_logs",
    "coaching_ai_outputs",
    "coaching_generation_jobs",
    "coaching_coach_directives",
  ]) {
    checks[table] = await tableExists(supabase, table);
  }
  const { error: reclaimError } = await supabase.rpc("reclaim_stale_coaching_generation_jobs", {
    p_stale_after_minutes: 15,
  });
  const { error: claimError } = await supabase.rpc("claim_coaching_generation_jobs", {
    p_limit: 0,
    p_locked_by: "phase3d-gate",
  });
  return {
    tables: checks,
    reclaimOk: reclaimError?.code !== "PGRST202",
    claimOk: claimError?.code !== "PGRST202",
    ok:
      Object.values(checks).every((item) => item.exists) &&
      reclaimError?.code !== "PGRST202" &&
      claimError?.code !== "PGRST202",
  };
}

async function verify031(supabase) {
  const table = await tableExists(supabase, "coaching_coach_actions");
  if (!table.exists) return { table, ok: false, columns: {} };
  const columns = {};
  for (const column of [
    "action_type",
    "status",
    "related_reason_codes",
    "evidence_refs",
    "is_material",
    "owner_member_id",
  ]) {
    const { error } = await supabase.from("coaching_coach_actions").select(column).limit(0);
    columns[column] = { exists: !error };
  }
  return {
    table,
    columns,
    ok: table.exists && Object.values(columns).every((c) => c.exists),
  };
}

async function rlsProbe(supabase) {
  // Service role bypasses RLS — confirm insert/select/update path works, and
  // that anon client cannot read rows.
  const { url } = resolveEnv();
  const fileEnv = { ...loadEnvFile(".env.local"), ...loadEnvFile(".env.production.local") };
  const anon = pick(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const { data: enrollments, error: enrollError } = await supabase
    .from("coaching_enrollments")
    .select("id, customer_id, owner_member_id, status")
    .eq("status", "active")
    .limit(1);
  if (enrollError || !enrollments?.[0]) {
    return { ok: false, error: enrollError?.message ?? "no_active_enrollment" };
  }
  const enrollment = enrollments[0];

  const insertPayload = {
    enrollment_id: enrollment.id,
    customer_id: enrollment.customer_id,
    owner_member_id: enrollment.owner_member_id,
    action_type: "acknowledged",
    status: "acknowledged",
    note: "Phase3d gate smoke: 最近因工作加班晚睡，本週先觀察。",
    related_reason_codes: ["recurring_late_sleep"],
    evidence_refs: [],
    is_material: true,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("coaching_coach_actions")
    .insert(insertPayload)
    .select("*")
    .single();
  if (insertError) {
    return { ok: false, step: "insert", error: insertError.message };
  }

  const { data: selected, error: selectError } = await supabase
    .from("coaching_coach_actions")
    .select("id, note, status, related_reason_codes, is_material")
    .eq("id", inserted.id)
    .maybeSingle();

  let anonIsolation = { skipped: true };
  if (anon && url) {
    const anonClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonRows, error: anonError } = await anonClient
      .from("coaching_coach_actions")
      .select("id")
      .eq("id", inserted.id);
    anonIsolation = {
      skipped: false,
      rowCount: anonRows?.length ?? 0,
      code: anonError?.code ?? null,
      message: anonError?.message ?? null,
      ok: (anonRows?.length ?? 0) === 0,
    };
  }

  // Soft cleanup: mark superseded rather than hard delete (auditability).
  const { error: updateError } = await supabase
    .from("coaching_coach_actions")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("id", inserted.id);

  return {
    ok: !selectError && !updateError && (anonIsolation.skipped || anonIsolation.ok),
    enrollmentId: enrollment.id,
    actionId: inserted.id,
    selectedNote: selected?.note ?? null,
    relatedReasonCodes: selected?.related_reason_codes ?? null,
    isMaterial: selected?.is_material ?? null,
    anonIsolation,
    updateError: updateError?.message ?? null,
  };
}

async function main() {
  const mode = process.argv[2] ?? "verify";
  const env = resolveEnv();
  const out = {
    mode,
    ok: false,
    projectRef: null,
    credentials: {
      hasUrl: !!env.url?.startsWith("http"),
      hasServiceKey: !!env.serviceKey,
      hasAccessToken: !!env.accessToken,
      hasOpenAi: !!env.openaiKey?.startsWith("sk-"),
    },
  };

  if (!env.url?.startsWith("http")) {
    out.error = "missing_supabase_url";
    writeFileSync(".tmp-phase3d-prod-gate-result.json", JSON.stringify(out, null, 2));
    process.exit(1);
  }
  out.projectRef = new URL(env.url).hostname.split(".")[0];

  if (!env.serviceKey && mode !== "ai-eval") {
    out.error = "missing_service_role_key_or_decrypted_vercel_env";
    out.hint =
      "Vercel Sensitive env vars do not decrypt via `vercel env pull` / local CLI. Provide SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN, or apply 031 in Supabase SQL Editor.";
    writeFileSync(".tmp-phase3d-prod-gate-result.json", JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const supabase = createClient(env.url, env.serviceKey ?? env.accessToken, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  out.pre031 = await verifyPre031(supabase);
  out.migration031Before = await verify031(supabase);

  if (mode === "apply") {
    if (!out.pre031.ok) {
      out.error = "pre_031_state_not_ready";
      writeFileSync(".tmp-phase3d-prod-gate-result.json", JSON.stringify(out, null, 2));
      process.exit(1);
    }
    if (!out.migration031Before.ok) {
      const sql = readFileSync("supabase/migrations/031_coaching_coach_actions.sql", "utf8");
      // Prefer Management API with access token; service role JWT usually cannot run DDL.
      const token = env.accessToken ?? env.serviceKey;
      out.apply = await runSql(sql, token, out.projectRef);
    } else {
      out.apply = { skipped: true, reason: "already_applied" };
    }
    out.migration031After = await verify031(supabase);
  }

  if (mode === "smoke" || mode === "apply") {
    if (!(out.migration031After ?? out.migration031Before).ok) {
      out.error = "031_not_applied";
      writeFileSync(".tmp-phase3d-prod-gate-result.json", JSON.stringify(out, null, 2));
      process.exit(1);
    }
    out.persistenceSmoke = await rlsProbe(supabase);
  }

  if (mode === "ai-eval") {
    if (!env.openaiKey?.startsWith("sk-")) {
      out.error = "missing_openai_api_key";
      writeFileSync(".tmp-phase3d-prod-gate-result.json", JSON.stringify(out, null, 2));
      process.exit(1);
    }
    process.env.OPENAI_API_KEY = env.openaiKey;
    process.env.COACHING_AI_EVAL_LIVE = "1";
    const result = spawnSync(
      "npx",
      ["vitest", "run", "src/lib/coaching/ai/coaching-ai-coach-action-eval.test.ts"],
      { encoding: "utf8", env: process.env },
    );
    out.aiEval = {
      status: result.status,
      stdoutTail: (result.stdout || "").slice(-4000),
      stderrTail: (result.stderr || "").slice(-2000),
    };
  }

  out.ok =
    out.pre031.ok &&
    (mode === "verify"
      ? true
      : mode === "ai-eval"
        ? out.aiEval?.status === 0
        : (out.migration031After ?? out.migration031Before).ok && out.persistenceSmoke?.ok);

  writeFileSync(".tmp-phase3d-prod-gate-result.json", JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
}

main().catch((error) => {
  writeFileSync(
    ".tmp-phase3d-prod-gate-result.json",
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2),
  );
  process.exit(1);
});
