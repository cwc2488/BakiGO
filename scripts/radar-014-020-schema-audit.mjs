import { readFileSync, writeFileSync } from "node:fs";
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
    // optional file
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

function resolveEnv() {
  const productionEnv = loadEnvFile(".env.production.local");
  const previewEnv = loadEnvFile(".env.preview.local");
  const localEnv = loadEnvFile(".env.local");
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
  return { url, serviceKey, accessToken, anonKey };
}

async function tableExists(supabase, name) {
  const { error } = await supabase.from(name).select("*").limit(0);
  if (error) return { exists: false, message: error.message };
  return { exists: true };
}

async function columnExists(supabase, table, column) {
  const { error } = await supabase.from(table).select(column).limit(0);
  if (error) return { exists: false, message: error.message };
  return { exists: true };
}

async function rpcExists(supabase, name, args) {
  const { error } = await supabase.rpc(name, args);
  if (error?.code === "PGRST202") return { exists: false, message: error.message };
  return { exists: true, message: error?.message ?? null };
}

async function columnsExist(supabase, table, columns) {
  const result = {};
  for (const column of columns) {
    result[column] = await columnExists(supabase, table, column);
  }
  return result;
}

function allExist(map) {
  return Object.values(map).every((item) => item.exists);
}

const MIGRATIONS = [
  {
    id: "014",
    file: "014_radar_scoring_v1.sql",
    dependsOn: [],
    productImpact:
      "Radar-only scoring metadata. No Quiz/21D/Coaching/Admin/Customer/Enrollment tables.",
    objects: [
      { kind: "table", name: "radar_scoring_policy_versions" },
      { kind: "table", name: "radar_candidate_score_snapshots" },
    ],
    columns: {
      radar_scoring_policy_versions: ["id", "scoring_version", "config"],
      radar_candidate_score_snapshots: ["id", "scoring_version", "overall_score", "component_scores"],
    },
  },
  {
    id: "015",
    file: "015_content_normalization_v1.sql",
    dependsOn: [],
    productImpact: "Radar normalization tables only. No product-domain writes.",
    objects: [
      { kind: "table", name: "candidate_normalization_runs" },
      { kind: "table", name: "candidate_content_normalized" },
    ],
    columns: {
      candidate_normalization_runs: ["candidate_id", "normalization_run_id", "data_completeness"],
      candidate_content_normalized: ["normalized_content_id", "candidate_id", "raw_snapshot_id", "text"],
    },
  },
  {
    id: "016",
    file: "016_radar_daily_pipeline_v1.sql",
    dependsOn: ["014"],
    productImpact:
      "Creates Radar pool/pipeline/job/Top20 tables. References members(id) only; does not alter Quiz/21D/Coaching/Admin/Customer/Enrollment columns.",
    objects: [
      { kind: "table", name: "candidate_pool" },
      { kind: "table", name: "member_candidate_state" },
      { kind: "table", name: "candidate_refresh_state" },
      { kind: "table", name: "candidate_refresh_queue" },
      { kind: "table", name: "candidate_analysis_runs" },
      { kind: "table", name: "candidate_baseline_score_snapshots" },
      { kind: "table", name: "radar_pipeline_runs" },
      { kind: "table", name: "radar_jobs" },
      { kind: "table", name: "radar_pipeline_job_runs" },
      { kind: "table", name: "member_daily_top20" },
      { kind: "table", name: "member_recommendation_occurrences" },
      { kind: "table", name: "radar_pipeline_config" },
      { kind: "rpc", name: "claim_radar_jobs", args: { p_limit: 0 } },
    ],
    columns: {
      candidate_pool: ["id", "lifecycle_state", "display_name", "primary_platform", "profile_semantic_hash"],
      radar_pipeline_runs: ["id", "run_date", "status"],
      radar_jobs: ["id", "job_type", "idempotency_key", "status"],
      radar_candidate_score_snapshots: ["analysis_run_id", "candidate_id_text"],
    },
  },
  {
    id: "017",
    file: "017_radar_pipeline_p2.sql",
    dependsOn: ["016"],
    productImpact: "Radar job recovery function + unique run_date index. No product-domain tables.",
    objects: [{ kind: "rpc", name: "reclaim_abandoned_radar_jobs", args: { p_stale_after_minutes: 30 } }],
    columns: {},
  },
  {
    id: "018",
    file: "018_radar_orchestrator_support.sql",
    dependsOn: ["016"],
    productImpact:
      "Radar keyword/geography/signal tables. References members(id) only; no Quiz/21D/Coaching schema changes.",
    objects: [
      { kind: "table", name: "radar_system_keywords" },
      { kind: "table", name: "radar_member_keywords" },
      { kind: "table", name: "radar_member_keyword_disabled" },
      { kind: "table", name: "member_development_areas" },
      { kind: "table", name: "candidate_discovery_signals" },
      { kind: "rpc", name: "list_adaptive_refresh_candidates", args: { p_limit: 1 } },
    ],
    columns: {
      candidate_discovery_signals: ["candidate_id", "signal_type", "expires_at"],
    },
  },
  {
    id: "019",
    file: "019_radar_p3_p6.sql",
    dependsOn: ["016"],
    productImpact: "Radar raw snapshots, discoveries, fetch audit. No product-domain tables.",
    objects: [
      { kind: "table", name: "candidate_content_snapshots_raw" },
      { kind: "table", name: "candidate_discoveries" },
      { kind: "table", name: "source_fetch_audit_log" },
      { kind: "table", name: "radar_member_score_progress" },
    ],
    columns: {
      candidate_content_snapshots_raw: ["id", "candidate_id", "platform", "external_content_id", "payload"],
      candidate_discoveries: ["member_id", "candidate_id", "keyword_phrase"],
      source_fetch_audit_log: ["adapter_id", "endpoint", "status", "metadata"],
    },
  },
  {
    id: "020",
    file: "020_radar_acquisition_v1.sql",
    dependsOn: ["016", "019"],
    productImpact: "Adds Radar acquisition columns + member submissions. Updates radar_pipeline_config only.",
    objects: [{ kind: "table", name: "candidate_member_submissions" }],
    columns: {
      candidate_pool: ["normalized_username", "acquisition_source"],
      candidate_discoveries: ["discovery_source", "org_keyword_phrase"],
      candidate_refresh_state: ["enrichment_capability_state"],
      candidate_member_submissions: ["member_id", "candidate_id", "normalized_username"],
    },
  },
];

async function auditRemote(supabase) {
  const migrations = {};
  for (const migration of MIGRATIONS) {
    const objects = {};
    for (const object of migration.objects) {
      if (object.kind === "table") {
        objects[object.name] = await tableExists(supabase, object.name);
      } else {
        objects[object.name] = await rpcExists(supabase, object.name, object.args);
      }
    }
    const columns = {};
    for (const [table, cols] of Object.entries(migration.columns)) {
      columns[table] = await columnsExist(supabase, table, cols);
    }
    const objectOk = Object.values(objects).every((item) => item.exists);
    const columnOk = Object.values(columns).every((map) => allExist(map));
    migrations[migration.id] = {
      file: migration.file,
      dependsOn: migration.dependsOn,
      productImpact: migration.productImpact,
      applied: objectOk && columnOk,
      objects,
      columns,
    };
  }
  return migrations;
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
    console.log("Usage: node scripts/radar-014-020-schema-audit.mjs <verify|apply>");
    process.exit(1);
  }

  const { url, serviceKey, accessToken, anonKey } = resolveEnv();
  const out = {
    mode,
    projectRef: null,
    env: {
      hasUrl: Boolean(url?.startsWith("http")),
      hasServiceKey: Boolean(serviceKey),
      hasAccessToken: Boolean(accessToken),
      hasAnonKey: Boolean(anonKey),
    },
    migrations: {},
    applyAttempts: [],
  };

  console.log(
    `radar-014-020-schema-audit mode=${mode} url=${out.env.hasUrl} serviceKey=${out.env.hasServiceKey} accessToken=${out.env.hasAccessToken}`,
  );

  if (!url?.startsWith("http")) {
    out.error = "invalid_supabase_url";
    writeFileSync(".tmp-radar-014-020-audit.json", JSON.stringify(out, null, 2));
    console.log("FAILED: invalid_supabase_url");
    process.exit(1);
  }
  out.projectRef = new URL(url).hostname.split(".")[0];
  console.log(`target projectRef=${out.projectRef}`);

  const clientKey = serviceKey ?? anonKey;
  if (!clientKey) {
    out.error = "missing_supabase_key";
    writeFileSync(".tmp-radar-014-020-audit.json", JSON.stringify(out, null, 2));
    console.log("FAILED: missing_supabase_key");
    process.exit(1);
  }

  const supabase = createClient(url, clientKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  out.migrations = await auditRemote(supabase);
  for (const [id, result] of Object.entries(out.migrations)) {
    console.log(`[${id}] ${result.applied ? "present" : "MISSING"} ${result.file}`);
    if (!result.applied) {
      for (const [name, object] of Object.entries(result.objects)) {
        if (!object.exists) console.log(`  missing object: ${name} — ${object.message}`);
      }
      for (const [table, cols] of Object.entries(result.columns)) {
        for (const [column, info] of Object.entries(cols)) {
          if (!info.exists) console.log(`  missing column: ${table}.${column} — ${info.message}`);
        }
      }
    }
  }

  const controlTables = {
    members: await tableExists(supabase, "members"),
    customers: await tableExists(supabase, "customers"),
    coaching_enrollments: await tableExists(supabase, "coaching_enrollments"),
  };
  // quiz table name may differ; probe a few known product tables without failing audit
  for (const name of [
    "quiz_responses",
    "quiz_results",
    "quiz_fat_loss_results",
    "experience_21d_interests",
    "platform_admins",
  ]) {
    controlTables[name] = await tableExists(supabase, name);
  }
  out.controlTables = controlTables;

  if (mode === "apply") {
    const order = ["014", "015", "016", "017", "018", "019", "020"];
    const tokens = [
      ["access_token", accessToken],
      ["service_role_key", serviceKey],
    ].filter(([, token]) => token);
    if (tokens.length === 0) {
      out.error = "apply_requires_supabase_access_token_or_service_role";
      writeFileSync(".tmp-radar-014-020-audit.json", JSON.stringify(out, null, 2));
      console.log("FAILED: apply_requires_supabase_access_token_or_service_role");
      process.exit(1);
    }

    for (const id of order) {
      const spec = MIGRATIONS.find((item) => item.id === id);
      const current = out.migrations[id];
      const depsMissing = spec.dependsOn.filter((dep) => !out.migrations[dep]?.applied);
      if (current.applied) {
        console.log(`[${id}] skipped already present`);
        continue;
      }
      if (depsMissing.length > 0) {
        console.log(`[${id}] STOP dependency missing: ${depsMissing.join(",")}`);
        out.error = `dependency_missing_for_${id}`;
        writeFileSync(".tmp-radar-014-020-audit.json", JSON.stringify(out, null, 2));
        process.exit(1);
      }
      const sql = readFileSync(`supabase/migrations/${spec.file}`, "utf8");
      let applied = false;
      for (const [label, token] of tokens) {
        console.log(`[${id}] applying via ${label}`);
        const attempt = await runSqlViaManagementApi(sql, token, out.projectRef);
        out.applyAttempts.push({ id, label, ok: attempt.ok, status: attempt.status, body: attempt.body });
        console.log(`[${id}] ${attempt.ok ? "applied" : "apply_failed"} status=${attempt.status}`);
        if (attempt.ok) {
          applied = true;
          break;
        }
      }
      if (!applied) {
        out.error = `apply_failed_${id}`;
        writeFileSync(".tmp-radar-014-020-audit.json", JSON.stringify(out, null, 2));
        process.exit(1);
      }
      out.migrations = await auditRemote(supabase);
      if (!out.migrations[id].applied) {
        out.error = `apply_not_visible_${id}`;
        writeFileSync(".tmp-radar-014-020-audit.json", JSON.stringify(out, null, 2));
        console.log(`[${id}] STOP applied but objects still missing`);
        process.exit(1);
      }
    }
  }

  out.ok = Object.values(out.migrations).every((item) => item.applied);
  writeFileSync(".tmp-radar-014-020-audit.json", JSON.stringify(out, null, 2));
  console.log(`Wrote .tmp-radar-014-020-audit.json ok=${out.ok}`);
  process.exit(out.ok || mode === "verify" ? 0 : 1);
}

main().catch((error) => {
  console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
