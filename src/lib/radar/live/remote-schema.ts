import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

export const RADAR_MIGRATIONS_014_020 = [
  { id: "014", file: "014_radar_scoring_v1.sql", dependsOn: [] as string[] },
  { id: "015", file: "015_content_normalization_v1.sql", dependsOn: [] as string[] },
  { id: "016", file: "016_radar_daily_pipeline_v1.sql", dependsOn: ["014"] },
  { id: "017", file: "017_radar_pipeline_p2.sql", dependsOn: ["016"] },
  { id: "018", file: "018_radar_orchestrator_support.sql", dependsOn: ["016"] },
  { id: "019", file: "019_radar_p3_p6.sql", dependsOn: ["016"] },
  { id: "020", file: "020_radar_acquisition_v1.sql", dependsOn: ["016", "019"] },
] as const;

const PROBES: Record<
  string,
  {
    tables: string[];
    columns: Record<string, string[]>;
    rpcs: Array<{ name: string; args: Record<string, unknown> }>;
  }
> = {
  "014": {
    tables: ["radar_scoring_policy_versions", "radar_candidate_score_snapshots"],
    columns: {
      radar_scoring_policy_versions: ["id", "scoring_version", "config"],
      radar_candidate_score_snapshots: ["id", "scoring_version", "overall_score", "component_scores"],
    },
    rpcs: [],
  },
  "015": {
    tables: ["candidate_normalization_runs", "candidate_content_normalized"],
    columns: {
      candidate_normalization_runs: ["candidate_id", "normalization_run_id", "data_completeness"],
      candidate_content_normalized: ["normalized_content_id", "candidate_id", "raw_snapshot_id", "text"],
    },
    rpcs: [],
  },
  "016": {
    tables: [
      "candidate_pool",
      "member_candidate_state",
      "candidate_refresh_state",
      "candidate_refresh_queue",
      "candidate_analysis_runs",
      "candidate_baseline_score_snapshots",
      "radar_pipeline_runs",
      "radar_jobs",
      "radar_pipeline_job_runs",
      "member_daily_top20",
      "member_recommendation_occurrences",
      "radar_pipeline_config",
    ],
    columns: {
      candidate_pool: ["id", "lifecycle_state", "display_name", "primary_platform", "profile_semantic_hash"],
      radar_pipeline_runs: ["id", "run_date", "status"],
      radar_jobs: ["id", "job_type", "idempotency_key", "status"],
      radar_candidate_score_snapshots: ["analysis_run_id", "candidate_id_text"],
    },
    rpcs: [{ name: "claim_radar_jobs", args: { p_limit: 0 } }],
  },
  "017": {
    tables: [],
    columns: {},
    rpcs: [{ name: "reclaim_abandoned_radar_jobs", args: { p_stale_after_minutes: 30 } }],
  },
  "018": {
    tables: [
      "radar_system_keywords",
      "radar_member_keywords",
      "radar_member_keyword_disabled",
      "member_development_areas",
      "candidate_discovery_signals",
    ],
    columns: {
      candidate_discovery_signals: ["candidate_id", "signal_type", "expires_at"],
    },
    rpcs: [{ name: "list_adaptive_refresh_candidates", args: { p_limit: 1 } }],
  },
  "019": {
    tables: [
      "candidate_content_snapshots_raw",
      "candidate_discoveries",
      "source_fetch_audit_log",
      "radar_member_score_progress",
    ],
    columns: {
      candidate_content_snapshots_raw: ["id", "candidate_id", "platform", "external_content_id", "payload"],
      candidate_discoveries: ["member_id", "candidate_id", "keyword_phrase"],
      source_fetch_audit_log: ["adapter_id", "endpoint", "status", "metadata"],
    },
    rpcs: [],
  },
  "020": {
    tables: ["candidate_member_submissions"],
    columns: {
      candidate_pool: ["normalized_username", "acquisition_source"],
      candidate_discoveries: ["discovery_source", "org_keyword_phrase"],
      candidate_refresh_state: ["enrichment_capability_state"],
      candidate_member_submissions: ["member_id", "candidate_id", "normalized_username"],
    },
    rpcs: [],
  },
};

async function tableExists(client: SupabaseClient, name: string) {
  const { error } = await client.from(name).select("*").limit(0);
  if (error) return { exists: false, message: error.message };
  return { exists: true };
}

async function columnExists(client: SupabaseClient, table: string, column: string) {
  const { error } = await client.from(table).select(column).limit(0);
  if (error) return { exists: false, message: error.message };
  return { exists: true };
}

async function rpcExists(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { error } = await client.rpc(name, args);
  if (error?.code === "PGRST202") return { exists: false, message: error.message };
  return { exists: true, message: error?.message ?? null };
}

export async function auditRadar014020(client: SupabaseClient) {
  const migrations: Record<string, { applied: boolean; missing: string[] }> = {};
  for (const spec of RADAR_MIGRATIONS_014_020) {
    const probe = PROBES[spec.id];
    const missing: string[] = [];
    for (const table of probe.tables) {
      const result = await tableExists(client, table);
      if (!result.exists) missing.push(`table:${table}`);
    }
    for (const [table, columns] of Object.entries(probe.columns)) {
      for (const column of columns) {
        const result = await columnExists(client, table, column);
        if (!result.exists) missing.push(`column:${table}.${column}`);
      }
    }
    for (const rpc of probe.rpcs) {
      const result = await rpcExists(client, rpc.name, rpc.args);
      if (!result.exists) missing.push(`rpc:${rpc.name}`);
    }
    migrations[spec.id] = { applied: missing.length === 0, missing };
  }
  return migrations;
}

function readMigrationSql(file: string): string {
  return readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8");
}

async function runSql(sql: string, token: string, projectRef: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body: body.slice(0, 1500) };
}

export async function applyMissingRadar014020(input: {
  client: SupabaseClient;
  projectRef: string;
}) {
  const current = await auditRadar014020(input.client);
  const tokens = [
    process.env.SUPABASE_ACCESS_TOKEN?.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  ].filter((token): token is string => Boolean(token && token.length > 20));

  if (tokens.length === 0) {
    return { ok: false, error: "apply_requires_supabase_access_token_or_service_role", attempts: [], migrations: current };
  }

  const attempts: Array<{ id: string; ok: boolean; status: number; body: string }> = [];

  for (const spec of RADAR_MIGRATIONS_014_020) {
    if (current[spec.id]?.applied) continue;
    const depsMissing = spec.dependsOn.filter((dep) => !current[dep]?.applied);
    if (depsMissing.length > 0) {
      return {
        ok: false,
        error: `dependency_missing_for_${spec.id}:${depsMissing.join(",")}`,
        attempts,
        migrations: current,
      };
    }

    const sql = readMigrationSql(spec.file);
    let applied = false;
    for (const token of tokens) {
      const attempt = await runSql(sql, token, input.projectRef);
      attempts.push({ id: spec.id, ok: attempt.ok, status: attempt.status, body: attempt.body });
      if (attempt.ok) {
        applied = true;
        break;
      }
    }
    if (!applied) {
      return { ok: false, error: `apply_failed_${spec.id}`, attempts, migrations: await auditRadar014020(input.client) };
    }
    const refreshed = await auditRadar014020(input.client);
    Object.assign(current, refreshed);
    if (!current[spec.id]?.applied) {
      return {
        ok: false,
        error: `apply_not_visible_${spec.id}`,
        attempts,
        migrations: current,
      };
    }
  }

  return { ok: true, error: null, attempts, migrations: current };
}
