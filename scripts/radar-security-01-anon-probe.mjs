// RADAR-SECURITY-01 adversarial probe.
//
// Runs against remote Supabase with the *browser* anon key — the exact key any
// visitor can read out of the client bundle. Proves whether Radar tables are
// reachable without authentication.
//
// Non-destructive by construction: reads are head-only counts, and write probes
// filter on member_id = all-zero UUID, which matches no real member. A permitted
// verb returns 0 rows changed; a blocked verb returns 42501.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const RADAR_TABLES = {
  "014": ["radar_scoring_policy_versions", "radar_candidate_score_snapshots"],
  "015": ["candidate_normalization_runs", "candidate_content_normalized"],
  "016": [
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
  "018": [
    "radar_system_keywords",
    "radar_member_keywords",
    "radar_member_keyword_disabled",
    "member_development_areas",
    "candidate_discovery_signals",
  ],
  "019": [
    "candidate_content_snapshots_raw",
    "candidate_discoveries",
    "source_fetch_audit_log",
    "radar_member_score_progress",
  ],
  "020": ["candidate_member_submissions"],
};

/** Member-scoped tables: a cross-member write here is the actual vulnerability. */
const MEMBER_SCOPED = ["member_candidate_state", "member_daily_top20", "member_development_areas"];
const NO_SUCH_MEMBER = "00000000-0000-0000-0000-000000000000";

function loadEnv(path) {
  try {
    for (const line of readFileSync(new URL(path, import.meta.url), "utf8").split("\n")) {
      const match = /^([A-Z0-9_]+)="?([^"]*)"?\s*$/.exec(line.trim());
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // optional
  }
}

loadEnv("../.env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url?.startsWith("http") || !anonKey) {
  console.log("FAILED: missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

function verdict(error, rows) {
  if (!error) return { outcome: "ALLOWED", detail: rows === null ? "ok" : `rows=${rows}` };
  if (error.code === "42501") return { outcome: "BLOCKED", detail: `42501 ${error.message}` };
  if (error.code === "42P01") return { outcome: "MISSING_TABLE", detail: error.message };
  return { outcome: `ERROR_${error.code ?? "?"}`, detail: error.message };
}

console.log(`project=${new URL(url).hostname.split(".")[0]} key=anon`);
console.log("");

let readable = 0;
let writable = 0;
const exposed = [];

for (const [migration, tables] of Object.entries(RADAR_TABLES)) {
  for (const table of tables) {
    // Not head-only: a head request returns an empty body, which hides the
    // Postgres error code we need to tell "denied" apart from "empty table".
    const { data, error } = await anon.from(table).select("*", { count: "exact" }).limit(1);
    const read = verdict(error, data?.length ?? 0);

    const probes = { select: read };
    if (MEMBER_SCOPED.includes(table)) {
      const del = await anon.from(table).delete().eq("member_id", NO_SUCH_MEMBER).select("member_id");
      probes.delete = verdict(del.error, del.data?.length ?? 0);
      const upd = await anon
        .from(table)
        .update({ member_id: NO_SUCH_MEMBER })
        .eq("member_id", NO_SUCH_MEMBER)
        .select("member_id");
      probes.update = verdict(upd.error, upd.data?.length ?? 0);
    }

    if (read.outcome === "ALLOWED") {
      readable += 1;
      exposed.push(table);
    }
    if (Object.values(probes).some((p, i) => i > 0 && p.outcome === "ALLOWED")) writable += 1;

    const summary = Object.entries(probes)
      .map(([verb, p]) => `${verb}=${p.outcome}${p.outcome === "ALLOWED" ? `(${p.detail})` : ""}`)
      .join(" ");
    console.log(`[${migration}] ${table.padEnd(38)} ${summary}`);
    if (read.outcome.startsWith("ERROR") || read.outcome === "MISSING_TABLE") {
      console.log(`    ${read.detail}`);
    }
  }
}

console.log("");
console.log(`anon_readable_tables=${readable} anon_writable_member_tables=${writable}`);
console.log(`exposed=${exposed.join(",") || "none"}`);
console.log(readable === 0 && writable === 0 ? "RESULT: anon fully blocked" : "RESULT: anon has access");
