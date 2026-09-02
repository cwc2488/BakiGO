/**
 * Production 2026-09-01 Rank rebuild — direct Supabase execution (no upstream AI).
 * Requires NEXT_PUBLIC_SUPABASE_URL (ubdrkrvyyrqdvlehzhsz) + SUPABASE_SERVICE_ROLE_KEY.
 * Never prints secret values.
 */
import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ALLOCATION_RULES } from "../src/lib/radar/allocation/allocation-rules";
import { createSupabaseRadarJobQueue } from "../src/lib/radar/jobs/supabase-queue-store";
import { runMemberRankRebuild } from "../src/lib/radar/jobs/run-member-rank-rebuild";
import type { WorkerContext } from "../src/lib/radar/jobs/workers/dispatch";
import { SupabaseRadarRepository } from "../src/lib/radar/repository/supabase-repository";
import { scoreSnapshotDateOrFilter } from "../src/lib/radar/repository/score-snapshot-date";
import { createSourceAdapterRegistry } from "../src/lib/radar/sources/registry";
import {
  buildRadarCronAuthorizationHeader,
  loadProductionEnvFile,
  readRadarCronClientSecret,
  resolveRadarCronAuthReport,
} from "./radar-prod-auth";

const PROD_PROJECT = "ubdrkrvyyrqdvlehzhsz";
const WRONG_PROJECT = "pgzfuqpsphwdcvcxnmrr";
const SNAPSHOT_DATE = "2026-09-01";
const PIPELINE_RUN_ID = "9e484340-4ccd-4c8c-9271-430705cae699";
const AFFECTED_MEMBER = "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92";
const RECOVERY_LABEL = "SCORE_RANK_CONTRACT_BATCH_2026-09-01";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < 20 || value.startsWith("[SENSITIVE]")) {
    throw new Error(`missing_or_placeholder:${name}`);
  }
  return value;
}

function assertProductionUrl(url: string) {
  if (url.includes(WRONG_PROJECT)) {
    throw new Error(`wrong_supabase_project:${WRONG_PROJECT}`);
  }
  if (!url.includes(PROD_PROJECT)) {
    throw new Error(`supabase_url_must_contain:${PROD_PROJECT}`);
  }
}

function createCtx(client: SupabaseClient): WorkerContext {
  const repo = new SupabaseRadarRepository(client);
  return {
    repo,
    queue: createSupabaseRadarJobQueue(client),
    sources: createSourceAdapterRegistry({
      record: (entry) => repo.recordSourceFetchAudit(entry),
    }),
    now: new Date(),
  };
}

async function countEmptyTop20(client: SupabaseClient) {
  const { data, error } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", SNAPSHOT_DATE);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ member_id: string; item_count: number | null }>;
  let empty = 0;
  let nonempty = 0;
  for (const row of rows) {
    if (Number(row.item_count ?? 0) === 0) empty += 1;
    else nonempty += 1;
  }
  return { total: rows.length, empty, nonempty, rows };
}

async function memberSnapshot(client: SupabaseClient, member_id: string) {
  const { data, error } = await client
    .from("member_daily_top20")
    .select("id, member_id, item_count, generated_at, items, pipeline_run_id")
    .eq("member_id", member_id)
    .eq("snapshot_date", SNAPSHOT_DATE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    member_id: string;
    item_count: number | null;
    generated_at: string | null;
    items: unknown;
    pipeline_run_id: string | null;
  } | null;
}

async function scoreUniverse(client: SupabaseClient, member_id: string) {
  const { data, error } = await client
    .from("radar_candidate_score_snapshots")
    .select("candidate_id_text, overall_score, analyzed_at, created_at, extraction_snapshot")
    .eq("member_id", member_id)
    .or(scoreSnapshotDateOrFilter(SNAPSHOT_DATE));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    candidate_id_text: string | null;
    overall_score: number | null;
    analyzed_at: string | null;
    created_at: string | null;
  }>;
  const latest = new Map<string, { score: number; ts: string }>();
  for (const row of rows) {
    const id = String(row.candidate_id_text ?? "");
    if (!id) continue;
    const ts = String(row.analyzed_at ?? row.created_at ?? "");
    const prev = latest.get(id);
    if (!prev || ts.localeCompare(prev.ts) > 0) {
      latest.set(id, { score: Number(row.overall_score), ts });
    }
  }
  const scores = [...latest.entries()]
    .map(([candidate_id, v]) => ({ candidate_id, score: v.score }))
    .sort((a, b) => b.score - a.score);
  const above40 = scores.filter((s) => s.score >= DEFAULT_ALLOCATION_RULES.minimum_qualified_score);
  return { visible: scores.length, above40: above40.length, top: scores[0]?.score ?? null, scores: above40 };
}

async function main() {
  loadProductionEnvFile(".env.production.local");
  const authReport = resolveRadarCronAuthReport();
  const cron = readRadarCronClientSecret();
  const origin = (process.env.PRODUCTION_ORIGIN ?? "https://bakigo.tw").replace(/\/$/, "");

  if (cron && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    const headers = buildRadarCronAuthorizationHeader(cron);
    const dry = await fetch(`${origin}/api/radar/jobs/member-rank-rebuild-batch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ dry_run: true }),
      cache: "no-store",
    });
    const dryJson = await dry.json().catch(() => ({}));
    if (dry.status === 401) {
      const report = {
        mode: "http",
        auth_report: authReport,
        auth_failure_class: "unauthorized_bearer_mismatch_or_server_secret_missing",
        http_status: 401,
        fix:
          "Set Cloud Agent RADAR_CRON_SECRET to the exact Vercel Production RADAR_CRON_SECRET value.",
        dry: dryJson,
      };
      writeFileSync(".tmp-prod-radar-rebuild-0901.json", JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      throw new Error("production_http_unauthorized");
    }
    const batch = await fetch(`${origin}/api/radar/jobs/member-rank-rebuild-batch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ member_limit: 200 }),
      cache: "no-store",
    });
    const batchJson = await batch.json().catch(() => ({}));
    const member = await fetch(`${origin}/api/radar/jobs/member-rank-recovery`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        member_id: AFFECTED_MEMBER,
        snapshot_date: SNAPSHOT_DATE,
        pipeline_run_id: PIPELINE_RUN_ID,
        force: true,
      }),
      cache: "no-store",
    });
    const memberJson = await member.json().catch(() => ({}));
    const evidence = (batchJson as { evidence?: Array<{ member_id: string; previous_generated_at?: string; new_generated_at?: string; snapshot_updated?: boolean }> }).evidence ?? [];
    const affectedEvidence = evidence.find((row) => row.member_id === AFFECTED_MEMBER);
    const report = {
      mode: "http",
      auth_report: authReport,
      http_status: batch.status,
      dry: dryJson,
      batch: batchJson,
      member: memberJson,
      affected_member: {
        previous_generated_at:
          affectedEvidence?.previous_generated_at ??
          (memberJson as { previous_generated_at?: string }).previous_generated_at ??
          null,
        new_generated_at:
          affectedEvidence?.new_generated_at ??
          (memberJson as { new_generated_at?: string }).new_generated_at ??
          null,
        snapshot_updated:
          affectedEvidence?.snapshot_updated ??
          (memberJson as { snapshots_updated?: number }).snapshots_updated === 1,
      },
    };
    writeFileSync(".tmp-prod-radar-rebuild-0901.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    const prev = report.affected_member.previous_generated_at;
    const next = report.affected_member.new_generated_at;
    const changed =
      Boolean(next) && (!prev || String(next).localeCompare(String(prev)) > 0);
    if (!changed) {
      process.exit(2);
    }
    return;
  }

  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  assertProductionUrl(url);

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const beforeCounts = await countEmptyTop20(client);
  const beforeMember = await memberSnapshot(client, AFFECTED_MEMBER);
  const beforeScores = await scoreUniverse(client, AFFECTED_MEMBER);

  const emptyMembers = (beforeCounts.rows ?? [])
    .filter((row) => Number(row.item_count ?? 0) === 0)
    .map((row) => String(row.member_id));

  const ctx = createCtx(client);
  const results: Array<{ member_id: string; ok: boolean; item_count: number; error_code?: string }> =
    [];

  for (const member_id of emptyMembers) {
    const rebuild = await runMemberRankRebuild(ctx, {
      member_id,
      snapshot_date: SNAPSHOT_DATE,
      pipeline_run_id: PIPELINE_RUN_ID,
      recovery_tag: RECOVERY_LABEL,
      force_new_job: true,
    });
    results.push({
      member_id,
      ok: rebuild.ok,
      item_count: rebuild.item_count,
      error_code: rebuild.error_code,
    });
  }

  const afterCounts = await countEmptyTop20(client);
  const afterMember = await memberSnapshot(client, AFFECTED_MEMBER);
  const afterScores = await scoreUniverse(client, AFFECTED_MEMBER);

  const report = {
    ok: results.every((r) => r.ok),
    supabase_project: PROD_PROJECT,
    snapshot_date: SNAPSHOT_DATE,
    pipeline_run_id: PIPELINE_RUN_ID,
    affected_member_id: AFFECTED_MEMBER,
    before: {
      empty_top20: beforeCounts.empty,
      nonempty_top20: beforeCounts.nonempty,
      member: beforeMember,
      score_universe: beforeScores,
    },
    after: {
      empty_top20: afterCounts.empty,
      nonempty_top20: afterCounts.nonempty,
      member: afterMember,
      score_universe: afterScores,
    },
    rebuild: {
      attempted: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    },
    generated_at_changed:
      beforeMember?.generated_at !== afterMember?.generated_at,
  };

  writeFileSync(".tmp-prod-radar-rebuild-0901.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.generated_at_changed) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
