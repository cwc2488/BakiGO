import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RadarJobQueue } from "./queue";
import type {
  ClaimJobsOptions,
  EnqueueJobInput,
  PipelineJobRunRecord,
  RadarJobQueueStore,
  RadarJobRecord,
} from "./types";

function mapJob(row: Record<string, unknown>): RadarJobRecord {
  return {
    id: String(row.id),
    pipeline_run_id: row.pipeline_run_id ? String(row.pipeline_run_id) : null,
    job_type: row.job_type as RadarJobRecord["job_type"],
    idempotency_key: String(row.idempotency_key),
    status: row.status as RadarJobRecord["status"],
    payload: (row.payload as Record<string, unknown>) ?? {},
    priority: Number(row.priority ?? 0),
    attempt_count: Number(row.attempt_count ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    scheduled_at: String(row.scheduled_at),
    available_at: String(row.available_at),
    started_at: row.started_at ? String(row.started_at) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null,
    error_code: row.error_code ? String(row.error_code) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    trace_id: row.trace_id ? String(row.trace_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class SupabaseRadarJobQueueStore implements RadarJobQueueStore {
  constructor(private readonly client: SupabaseClient) {}

  async findById(job_id: string): Promise<RadarJobRecord | null> {
    const { data, error } = await this.client
      .from("radar_jobs")
      .select("*")
      .eq("id", job_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapJob(data) : null;
  }

  async findByIdempotencyKey(idempotency_key: string): Promise<RadarJobRecord | null> {
    const { data, error } = await this.client
      .from("radar_jobs")
      .select("*")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapJob(data) : null;
  }

  async insertJob(
    input: EnqueueJobInput & { id: string; now: Date },
  ): Promise<RadarJobRecord> {
    const row = {
      id: input.id,
      pipeline_run_id: input.pipeline_run_id ?? null,
      job_type: input.job_type,
      idempotency_key: input.idempotency_key,
      status: "pending",
      payload: input.payload ?? {},
      priority: input.priority ?? 0,
      attempt_count: 0,
      max_attempts: input.max_attempts ?? 3,
      scheduled_at: (input.scheduled_at ?? input.now).toISOString(),
      available_at: (input.available_at ?? input.now).toISOString(),
      trace_id: input.trace_id ?? null,
    };

    const { data, error } = await this.client
      .from("radar_jobs")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const existing = await this.findByIdempotencyKey(input.idempotency_key);
        if (existing) return existing;
      }
      throw new Error(error.message);
    }

    return mapJob(data);
  }

  async claimJobs(options: ClaimJobsOptions): Promise<RadarJobRecord[]> {
    await this.client.rpc("reclaim_abandoned_radar_jobs", {
      p_stale_after_minutes: 30,
    });

    const { data, error } = await this.client.rpc("claim_radar_jobs", {
      p_limit: options.limit ?? 25,
      p_job_types: options.job_types ?? null,
    });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => mapJob(row));
  }

  async markSucceeded(job_id: string, finished_at: Date): Promise<RadarJobRecord | null> {
    const { data, error } = await this.client
      .from("radar_jobs")
      .update({
        status: "succeeded",
        finished_at: finished_at.toISOString(),
        updated_at: finished_at.toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", job_id)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapJob(data) : null;
  }

  async markFailed(input: {
    job_id: string;
    status: "failed" | "dead_letter";
    error_code: string;
    error_message: string;
    available_at: Date | null;
    finished_at: Date;
  }): Promise<RadarJobRecord | null> {
    const patch: Record<string, unknown> = {
      status: input.status,
      error_code: input.error_code,
      error_message: input.error_message,
      updated_at: input.finished_at.toISOString(),
    };
    if (input.available_at) {
      patch.available_at = input.available_at.toISOString();
    }
    if (input.status === "dead_letter") {
      patch.finished_at = input.finished_at.toISOString();
    }

    const { data, error } = await this.client
      .from("radar_jobs")
      .update(patch)
      .eq("id", input.job_id)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapJob(data) : null;
  }

  async insertJobRun(input: Omit<PipelineJobRunRecord, "id"> & { id: string }): Promise<void> {
    const { error } = await this.client.from("radar_pipeline_job_runs").insert({
      id: input.id,
      pipeline_run_id: input.pipeline_run_id,
      job_id: input.job_id,
      job_type: input.job_type,
      attempt_number: input.attempt_number,
      status: input.status,
      started_at: input.started_at,
      finished_at: input.finished_at,
      error_code: input.error_code,
      error_message: input.error_message,
      metrics: input.metrics,
    });
    if (error) throw new Error(error.message);
  }

  async updateJobRun(
    id: string,
    patch: Partial<
      Pick<
        PipelineJobRunRecord,
        "status" | "finished_at" | "error_code" | "error_message" | "metrics"
      >
    >,
  ): Promise<void> {
    const { error } = await this.client
      .from("radar_pipeline_job_runs")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
}

export async function reclaimAbandonedRadarJobs(
  client: SupabaseClient,
  staleAfterMinutes = 30,
): Promise<number> {
  const { data, error } = await client.rpc("reclaim_abandoned_radar_jobs", {
    p_stale_after_minutes: staleAfterMinutes,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export function createSupabaseRadarJobQueue(client: SupabaseClient): RadarJobQueue {
  return new RadarJobQueue(new SupabaseRadarJobQueueStore(client));
}
