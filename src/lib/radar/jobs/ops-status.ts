import type { SupabaseClient } from "@supabase/supabase-js";
import { RADAR_ABANDONED_RECLAIM_MINUTES } from "./auto-drain";
import { resolveDailyPipelineRunDate } from "../pipeline/run-date";

const JOB_PAGE = 1000;
const RUN_COLUMNS = "id, run_date, status, triggered_by, started_at, finished_at";
const JOB_COLUMNS =
  "job_type, status, attempt_count, started_at, finished_at, created_at, updated_at";

export type RadarJobOpsCounts = {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  dead_letter: number;
};

export type RadarOldestRunningJob = {
  stage: string;
  started_at: string | null;
  age_minutes: number | null;
  attempt: number;
  reclaim_threshold_passed: boolean;
};

export type RadarPipelineRunOps = {
  pipeline_run_id: string;
  run_date: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
  jobs: RadarJobOpsCounts;
  stage_breakdown: Record<string, RadarJobOpsCounts>;
  last_progress_at: string | null;
  rank_status: "absent" | "pending" | "running" | "succeeded" | "failed" | "dead_letter";
  rank_count: number;
  recommendation_count: number;
  oldest_running: RadarOldestRunningJob | null;
};

export type RadarOpsStatus = {
  current_run_date: string;
  timezone: "Asia/Taipei";
  run: RadarPipelineRunOps | null;
  other_open_runs: RadarPipelineRunOps[];
};

function emptyCounts(): RadarJobOpsCounts {
  return {
    total: 0,
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead_letter: 0,
  };
}

function bump(counts: RadarJobOpsCounts, status: string) {
  counts.total += 1;
  if (status === "pending" || status === "queued") counts.pending += 1;
  else if (status === "running") counts.running += 1;
  else if (status === "succeeded") counts.succeeded += 1;
  else if (status === "failed") counts.failed += 1;
  else if (status === "dead_letter") counts.dead_letter += 1;
}

function ageMinutes(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
}

function laterStamp(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current || next > current) return next;
  return current;
}

type JobRow = {
  job_type: string;
  status: string;
  attempt_count: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RunRow = {
  id: string;
  run_date: string;
  status: string;
  triggered_by: string | null;
  started_at: string | null;
  finished_at: string | null;
};

async function listJobRows(client: SupabaseClient, pipelineRunId: string): Promise<JobRow[]> {
  const rows: JobRow[] = [];
  for (let from = 0; ; from += JOB_PAGE) {
    const { data, error } = await client
      .from("radar_jobs")
      .select(JOB_COLUMNS)
      .eq("pipeline_run_id", pipelineRunId)
      .range(from, from + JOB_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as JobRow[];
    rows.push(...page);
    if (page.length < JOB_PAGE) break;
  }
  return rows;
}

async function recommendationCount(
  client: SupabaseClient,
  snapshotDate: string,
): Promise<number> {
  const { data, error } = await client
    .from("member_daily_top20")
    .select("item_count")
    .eq("snapshot_date", snapshotDate);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + Number(row.item_count ?? 0), 0);
}

export function summarizeRadarJobs(
  jobs: JobRow[],
  now: Date,
): Omit<RadarPipelineRunOps, "pipeline_run_id" | "run_date" | "status" | "created_at" | "updated_at" | "finished_at" | "recommendation_count"> {
  const counts = emptyCounts();
  const stage_breakdown: Record<string, RadarJobOpsCounts> = {};
  let last_progress_at: string | null = null;
  let rank_status: RadarPipelineRunOps["rank_status"] = "absent";
  let rank_count = 0;
  let oldest: RadarOldestRunningJob | null = null;

  for (const job of jobs) {
    bump(counts, job.status);
    const stage = job.job_type || "unknown";
    stage_breakdown[stage] ??= emptyCounts();
    bump(stage_breakdown[stage], job.status);
    last_progress_at = laterStamp(
      last_progress_at,
      job.updated_at ?? job.finished_at ?? job.started_at ?? job.created_at,
    );

    if (job.job_type === "rank") {
      rank_count += 1;
      if (job.status === "succeeded") rank_status = "succeeded";
      else if (rank_status !== "succeeded") {
        if (job.status === "running") rank_status = "running";
        else if (job.status === "pending" && rank_status !== "running") rank_status = "pending";
        else if (job.status === "failed" && rank_status === "absent") rank_status = "failed";
        else if (job.status === "dead_letter" && rank_status === "absent") rank_status = "dead_letter";
      }
    }

    if (job.status === "running") {
      const candidate: RadarOldestRunningJob = {
        stage,
        started_at: job.started_at,
        age_minutes: ageMinutes(job.started_at, now),
        attempt: Number(job.attempt_count ?? 0),
        reclaim_threshold_passed: (ageMinutes(job.started_at, now) ?? 0) >= RADAR_ABANDONED_RECLAIM_MINUTES,
      };
      if (!oldest || String(candidate.started_at ?? "") < String(oldest.started_at ?? "")) {
        oldest = candidate;
      }
    }
  }

  return {
    jobs: counts,
    stage_breakdown,
    last_progress_at,
    rank_status,
    rank_count,
    oldest_running: oldest,
  };
}

async function buildRunOps(client: SupabaseClient, run: RunRow, now: Date): Promise<RadarPipelineRunOps> {
  const jobs = await listJobRows(client, run.id);
  const summary = summarizeRadarJobs(jobs, now);
  return {
    pipeline_run_id: run.id,
    run_date: run.run_date,
    status: run.status,
    created_at: run.started_at,
    updated_at: run.finished_at ?? run.started_at,
    finished_at: run.finished_at,
    recommendation_count: await recommendationCount(client, run.run_date),
    ...summary,
  };
}

export async function loadRadarOpsStatus(
  client: SupabaseClient,
  input?: { now?: Date; run_date?: string },
): Promise<RadarOpsStatus> {
  const now = input?.now ?? new Date();
  const current_run_date = resolveDailyPipelineRunDate({ now, run_date: input?.run_date });

  const { data: recent, error } = await client
    .from("radar_pipeline_runs")
    .select(RUN_COLUMNS)
    .order("run_date", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);

  const runs = (recent ?? []) as RunRow[];
  const current = runs.find((row) => row.run_date === current_run_date) ?? null;
  const others = runs.filter(
    (row) =>
      row.run_date !== current_run_date &&
      (row.status === "pending" || row.status === "running"),
  );

  return {
    current_run_date,
    timezone: "Asia/Taipei",
    run: current ? await buildRunOps(client, current, now) : null,
    other_open_runs: await Promise.all(others.map((row) => buildRunOps(client, row, now))),
  };
}
