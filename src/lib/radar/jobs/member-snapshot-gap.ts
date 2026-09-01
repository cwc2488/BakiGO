import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreSnapshotDateOrFilter,
  scoreSnapshotRowMatchesDate,
} from "../repository/score-snapshot-date";

/**
 * RADAR-MEMBER-SNAPSHOT-GAP-01 — read-only member-scoped diagnosis.
 * Uses service role on the server; never mutates.
 */

const RUN_ID_TODAY = "64499623-d0ff-4b4f-8336-2a17091af7cc";

export type MemberSnapshotGapReport = {
  read_only: true;
  member_id: string;
  snapshot_date: string;
  pipeline_run_id: string;
  member: {
    id: string;
    name: string | null;
    member_number: string | null;
    email: string | null;
  } | null;
  snapshot: {
    exists: boolean;
    id: string | null;
    item_count: number | null;
    pipeline_run_id: string | null;
    generated_at: string | null;
  };
  rank_jobs: Array<{
    id: string;
    status: string;
    attempt_count: number;
    error_code: string | null;
    error_message: string | null;
    payload: Record<string, unknown>;
    metrics: Record<string, unknown> | null;
    created_at: string | null;
    started_at: string | null;
    finished_at: string | null;
  }>;
  rank_target_member_ids: string[];
  member_included_in_rank_targets: boolean;
  score_progress: {
    expected_score_jobs: number | null;
    terminal_score_jobs: number | null;
    rank_enqueued: boolean | null;
  };
  score_snapshot_count: number;
  member_handled_or_in_progress_count: number;
  org_snapshot_rows: number;
  org_recommendation_sum: number;
  org_item_count_histogram: Record<string, number>;
  org_zero_item_snapshots: number;
  code_zero_result_writes_snapshot: true;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function loadMemberSnapshotGapReport(
  client: SupabaseClient,
  input: {
    member_id: string;
    snapshot_date: string;
    pipeline_run_id?: string | null;
  },
): Promise<MemberSnapshotGapReport> {
  const member_id = input.member_id.trim();
  const snapshot_date = input.snapshot_date.trim();
  const pipeline_run_id = (input.pipeline_run_id?.trim() || RUN_ID_TODAY).trim();

  const { data: memberRow } = await client
    .from("members")
    .select("id, name, member_number, email")
    .eq("id", member_id)
    .maybeSingle();

  const { data: snapshotRow } = await client
    .from("member_daily_top20")
    .select("id, member_id, pipeline_run_id, snapshot_date, generated_at, item_count")
    .eq("member_id", member_id)
    .eq("snapshot_date", snapshot_date)
    .maybeSingle();

  const { data: rankJobs } = await client
    .from("radar_jobs")
    .select(
      "id, status, attempt_count, error_code, error_message, payload, metrics, created_at, started_at, finished_at",
    )
    .eq("pipeline_run_id", pipeline_run_id)
    .eq("job_type", "rank");

  const allRank = rankJobs ?? [];
  const rank_target_member_ids = [
    ...new Set(
      allRank
        .map((row) => String(asRecord(row.payload).member_id ?? ""))
        .filter(Boolean),
    ),
  ].sort();

  const member_rank_jobs = allRank.filter(
    (row) => String(asRecord(row.payload).member_id ?? "") === member_id,
  );

  const { data: progress } = await client
    .from("radar_member_score_progress")
    .select("expected_score_jobs, terminal_score_jobs, rank_enqueued")
    .eq("pipeline_run_id", pipeline_run_id)
    .eq("member_id", member_id)
    .maybeSingle();

  const { data: scoreRows, error: scoreRowsError } = await client
    .from("radar_candidate_score_snapshots")
    .select("id, candidate_id_text, analyzed_at, created_at, extraction_snapshot")
    .eq("member_id", member_id)
    .or(scoreSnapshotDateOrFilter(snapshot_date));
  if (scoreRowsError) throw new Error(scoreRowsError.message);

  const sameDayScores = (scoreRows ?? []).filter((row) =>
    scoreSnapshotRowMatchesDate(row, snapshot_date),
  );
  const latestScoreCandidates = new Set<string>();
  for (const row of [...sameDayScores].sort((a, b) =>
    String(a.analyzed_at ?? a.created_at ?? "").localeCompare(
      String(b.analyzed_at ?? b.created_at ?? ""),
    ),
  )) {
    const id = String(row.candidate_id_text ?? "");
    if (id) latestScoreCandidates.add(id);
  }
  const scoreCount = latestScoreCandidates.size;

  const { count: handledCount } = await client
    .from("member_candidate_state")
    .select("member_id", { count: "exact", head: true })
    .eq("member_id", member_id)
    .or(
      "development_state.eq.in_progress,development_state.eq.already_known,excluded_from_recommendations.eq.true",
    );

  const { data: orgSnapshots } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", snapshot_date);

  const histogram: Record<string, number> = {};
  let orgSum = 0;
  let zeroItems = 0;
  for (const row of orgSnapshots ?? []) {
    const n = Number(row.item_count ?? 0);
    orgSum += n;
    if (n === 0) zeroItems += 1;
    const key = String(n);
    histogram[key] = (histogram[key] ?? 0) + 1;
  }

  return {
    read_only: true,
    member_id,
    snapshot_date,
    pipeline_run_id,
    member: memberRow
      ? {
          id: String(memberRow.id),
          name: memberRow.name ? String(memberRow.name) : null,
          member_number: memberRow.member_number ? String(memberRow.member_number) : null,
          email: memberRow.email ? String(memberRow.email) : null,
        }
      : null,
    snapshot: {
      exists: Boolean(snapshotRow),
      id: snapshotRow ? String(snapshotRow.id) : null,
      item_count: snapshotRow ? Number(snapshotRow.item_count) : null,
      pipeline_run_id: snapshotRow?.pipeline_run_id
        ? String(snapshotRow.pipeline_run_id)
        : null,
      generated_at: snapshotRow?.generated_at ? String(snapshotRow.generated_at) : null,
    },
    rank_jobs: member_rank_jobs.map((row) => ({
      id: String(row.id),
      status: String(row.status),
      attempt_count: Number(row.attempt_count ?? 0),
      error_code: row.error_code ? String(row.error_code) : null,
      error_message: row.error_message ? String(row.error_message).slice(0, 240) : null,
      payload: asRecord(row.payload),
      metrics: row.metrics ? asRecord(row.metrics) : null,
      created_at: row.created_at ? String(row.created_at) : null,
      started_at: row.started_at ? String(row.started_at) : null,
      finished_at: row.finished_at ? String(row.finished_at) : null,
    })),
    rank_target_member_ids,
    member_included_in_rank_targets: rank_target_member_ids.includes(member_id),
    score_progress: {
      expected_score_jobs:
        progress?.expected_score_jobs == null ? null : Number(progress.expected_score_jobs),
      terminal_score_jobs:
        progress?.terminal_score_jobs == null ? null : Number(progress.terminal_score_jobs),
      rank_enqueued: progress == null ? null : Boolean(progress.rank_enqueued),
    },
    score_snapshot_count: scoreCount,
    member_handled_or_in_progress_count: handledCount ?? 0,
    org_snapshot_rows: (orgSnapshots ?? []).length,
    org_recommendation_sum: orgSum,
    org_item_count_histogram: histogram,
    org_zero_item_snapshots: zeroItems,
    code_zero_result_writes_snapshot: true,
  };
}

export async function resolveMemberIdByDisplayName(
  client: SupabaseClient,
  needle: string,
): Promise<Array<{ id: string; name: string | null; member_number: string | null }>> {
  const q = needle.trim();
  const { data, error } = await client
    .from("members")
    .select("id, name, member_number")
    .ilike("name", `%${q}%`)
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: row.name ? String(row.name) : null,
    member_number: row.member_number ? String(row.member_number) : null,
  }));
}
