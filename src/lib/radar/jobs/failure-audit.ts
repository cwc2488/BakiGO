import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeErrorMessage } from "@/lib/meta-review/sanitize-error";

const JOB_PAGE = 1000;
const AUDIT_COLUMNS =
  "id, job_type, status, attempt_count, max_attempts, error_code, error_message, available_at, started_at, finished_at, created_at, updated_at";

export type RadarFailedJobRow = {
  id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  available_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RadarFailureGroup = {
  job_type: string;
  status: string;
  error_code: string;
  error_message: string;
  attempt_count: number;
  count: number;
  first_started_at: string | null;
  last_updated_at: string | null;
};

export type RadarFailureAudit = {
  pipeline_run_id: string;
  failed_or_dead: number;
  pending: number;
  pending_now_available: number;
  groups: RadarFailureGroup[];
  unique_error_codes: string[];
  unique_error_messages: string[];
  pending_by_type: Record<string, number>;
};

function asJob(row: Record<string, unknown>): RadarFailedJobRow {
  return {
    id: String(row.id),
    job_type: String(row.job_type ?? "unknown"),
    status: String(row.status ?? "unknown"),
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? 0),
    error_code: row.error_code ? String(row.error_code) : null,
    error_message: row.error_message
      ? sanitizeErrorMessage(String(row.error_message)).slice(0, 240)
      : null,
    available_at: row.available_at ? String(row.available_at) : null,
    started_at: row.started_at ? String(row.started_at) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export function groupRadarFailures(
  jobs: RadarFailedJobRow[],
  now = new Date(),
): Omit<RadarFailureAudit, "pipeline_run_id"> {
  const failed = jobs.filter((job) => job.status === "failed" || job.status === "dead_letter");
  const pending = jobs.filter((job) => job.status === "pending" || job.status === "queued");
  const nowIso = now.toISOString();
  const groups = new Map<string, RadarFailureGroup>();

  for (const job of failed) {
    const error_code = job.error_code ?? "null";
    const error_message = job.error_message ?? "null";
    const key = [job.job_type, job.status, error_code, error_message, String(job.attempt_count)].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (job.started_at && (!existing.first_started_at || job.started_at < existing.first_started_at)) {
        existing.first_started_at = job.started_at;
      }
      if (job.updated_at && (!existing.last_updated_at || job.updated_at > existing.last_updated_at)) {
        existing.last_updated_at = job.updated_at;
      }
      continue;
    }
    groups.set(key, {
      job_type: job.job_type,
      status: job.status,
      error_code,
      error_message,
      attempt_count: job.attempt_count,
      count: 1,
      first_started_at: job.started_at,
      last_updated_at: job.updated_at,
    });
  }

  const pending_by_type: Record<string, number> = {};
  for (const job of pending) {
    pending_by_type[job.job_type] = (pending_by_type[job.job_type] ?? 0) + 1;
  }

  return {
    failed_or_dead: failed.length,
    pending: pending.length,
    pending_now_available: pending.filter((job) => !job.available_at || job.available_at <= nowIso).length,
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
    unique_error_codes: [...new Set(failed.map((job) => job.error_code ?? "null"))],
    unique_error_messages: [...new Set(failed.map((job) => job.error_message ?? "null"))],
    pending_by_type,
  };
}

async function listAuditRows(
  client: SupabaseClient,
  pipelineRunId: string,
): Promise<RadarFailedJobRow[]> {
  const rows: RadarFailedJobRow[] = [];
  for (let from = 0; ; from += JOB_PAGE) {
    const { data, error } = await client
      .from("radar_jobs")
      .select(AUDIT_COLUMNS)
      .eq("pipeline_run_id", pipelineRunId)
      .range(from, from + JOB_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = ((data ?? []) as Record<string, unknown>[]).map(asJob);
    rows.push(...page);
    if (page.length < JOB_PAGE) break;
  }
  return rows;
}

export async function loadRadarFailureAudit(
  client: SupabaseClient,
  pipeline_run_id: string,
  now = new Date(),
): Promise<RadarFailureAudit> {
  const jobs = await listAuditRows(client, pipeline_run_id);
  return {
    pipeline_run_id,
    ...groupRadarFailures(jobs, now),
  };
}
