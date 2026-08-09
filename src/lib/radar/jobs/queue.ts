import { randomUUID } from "node:crypto";
import type {
  ClaimJobsOptions,
  CompleteJobInput,
  EnqueueJobInput,
  FailJobInput,
  RadarJobQueueStore,
  RadarJobRecord,
} from "./types";
import {
  computeAvailableAt,
  computeBackoffMs,
  resolveNextJobStatus,
  resolveRetryPolicy,
} from "./retry-policy";

function iso(date: Date): string {
  return date.toISOString();
}

export class InMemoryRadarJobQueueStore implements RadarJobQueueStore {
  private jobs = new Map<string, RadarJobRecord>();
  private idempotency = new Map<string, string>();
  jobRuns: Array<Record<string, unknown>> = [];

  get jobCount(): number {
    return this.jobs.size;
  }

  async findById(job_id: string): Promise<RadarJobRecord | null> {
    return this.jobs.get(job_id) ?? null;
  }

  async findByIdempotencyKey(idempotency_key: string): Promise<RadarJobRecord | null> {
    const id = this.idempotency.get(idempotency_key);
    if (!id) return null;
    return this.jobs.get(id) ?? null;
  }

  async insertJob(
    input: EnqueueJobInput & { id: string; now: Date },
  ): Promise<RadarJobRecord> {
    const record: RadarJobRecord = {
      id: input.id,
      pipeline_run_id: input.pipeline_run_id ?? null,
      job_type: input.job_type,
      idempotency_key: input.idempotency_key,
      status: "pending",
      payload: input.payload ?? {},
      priority: input.priority ?? 0,
      attempt_count: 0,
      max_attempts: input.max_attempts ?? 3,
      scheduled_at: iso(input.scheduled_at ?? input.now),
      available_at: iso(input.available_at ?? input.now),
      started_at: null,
      finished_at: null,
      error_code: null,
      error_message: null,
      trace_id: input.trace_id ?? null,
      created_at: iso(input.now),
      updated_at: iso(input.now),
    };
    this.jobs.set(record.id, record);
    this.idempotency.set(record.idempotency_key, record.id);
    return record;
  }

  async claimJobs(options: ClaimJobsOptions): Promise<RadarJobRecord[]> {
    const now = options.now ?? new Date();
    const limit = options.limit ?? 25;
    const eligible = [...this.jobs.values()]
      .filter((job) => {
        if (!["pending", "failed"].includes(job.status)) return false;
        if (new Date(job.available_at).getTime() > now.getTime()) return false;
        if (job.attempt_count >= job.max_attempts) return false;
        if (options.job_types && !options.job_types.includes(job.job_type)) return false;
        return true;
      })
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.scheduled_at.localeCompare(b.scheduled_at);
      })
      .slice(0, limit);

    const claimed: RadarJobRecord[] = [];
    for (const job of eligible) {
      const updated: RadarJobRecord = {
        ...job,
        status: "running",
        attempt_count: job.attempt_count + 1,
        started_at: iso(now),
        updated_at: iso(now),
      };
      this.jobs.set(job.id, updated);
      claimed.push(updated);
    }
    return claimed;
  }

  async markSucceeded(job_id: string, finished_at: Date): Promise<RadarJobRecord | null> {
    const job = this.jobs.get(job_id);
    if (!job) return null;
    const updated: RadarJobRecord = {
      ...job,
      status: "succeeded",
      finished_at: iso(finished_at),
      updated_at: iso(finished_at),
      error_code: null,
      error_message: null,
    };
    this.jobs.set(job_id, updated);
    return updated;
  }

  async markFailed(input: {
    job_id: string;
    status: "failed" | "dead_letter";
    error_code: string;
    error_message: string;
    available_at: Date | null;
    finished_at: Date;
  }): Promise<RadarJobRecord | null> {
    const job = this.jobs.get(input.job_id);
    if (!job) return null;
    const updated: RadarJobRecord = {
      ...job,
      status: input.status,
      error_code: input.error_code,
      error_message: input.error_message,
      available_at: input.available_at ? iso(input.available_at) : job.available_at,
      finished_at: input.status === "dead_letter" ? iso(input.finished_at) : job.finished_at,
      updated_at: iso(input.finished_at),
    };
    this.jobs.set(input.job_id, updated);
    return updated;
  }

  async insertJobRun(input: Record<string, unknown>): Promise<void> {
    this.jobRuns.push(input);
  }

  async updateJobRun(id: string, patch: Record<string, unknown>): Promise<void> {
    const index = this.jobRuns.findIndex((row) => row.id === id);
    if (index === -1) return;
    this.jobRuns[index] = { ...this.jobRuns[index], ...patch };
  }
}

export class RadarJobQueue {
  constructor(private readonly store: RadarJobQueueStore) {}

  async enqueue(input: EnqueueJobInput, now = new Date()): Promise<{
    job: RadarJobRecord;
    created: boolean;
  }> {
    const existing = await this.store.findByIdempotencyKey(input.idempotency_key);
    if (existing && existing.status !== "dead_letter") {
      return { job: existing, created: false };
    }

    const policy = resolveRetryPolicy("UNKNOWN");
    const job = await this.store.insertJob({
      ...input,
      id: randomUUID(),
      now,
      max_attempts: input.max_attempts ?? policy.max_attempts,
    });
    return { job, created: true };
  }

  async claim(options: ClaimJobsOptions = {}): Promise<RadarJobRecord[]> {
    return this.store.claimJobs(options);
  }

  async complete(input: CompleteJobInput, now = new Date()): Promise<RadarJobRecord | null> {
    const job = await this.store.markSucceeded(input.job_id, now);
    if (!job) return null;

    const runId = randomUUID();
    await this.store.insertJobRun({
      id: runId,
      pipeline_run_id: job.pipeline_run_id,
      job_id: job.id,
      job_type: job.job_type,
      attempt_number: job.attempt_count,
      status: "succeeded",
      started_at: job.started_at ?? iso(now),
      finished_at: iso(now),
      error_code: null,
      error_message: null,
      metrics: input.metrics ?? {},
    });

    return job;
  }

  async fail(input: FailJobInput): Promise<RadarJobRecord | null> {
    const now = input.now ?? new Date();
    const policy = resolveRetryPolicy(input.error_code);
    const retryable = input.retryable && policy.retryable;

    const jobBefore = await this.store.findById(input.job_id);
    if (!jobBefore) return null;

    const maxAttempts = jobBefore.max_attempts;
    const nextStatus = resolveNextJobStatus({
      retryable,
      attempt_count: jobBefore.attempt_count,
      max_attempts: maxAttempts,
    });

    const backoff =
      nextStatus === "failed"
        ? computeBackoffMs(policy, jobBefore.attempt_count)
        : 0;
    const available_at =
      nextStatus === "failed" ? computeAvailableAt(now, backoff) : null;

    const job = await this.store.markFailed({
      job_id: input.job_id,
      status: nextStatus,
      error_code: input.error_code,
      error_message: input.error_message,
      available_at,
      finished_at: now,
    });

    await this.store.insertJobRun({
      id: randomUUID(),
      pipeline_run_id: jobBefore.pipeline_run_id,
      job_id: jobBefore.id,
      job_type: jobBefore.job_type,
      attempt_number: jobBefore.attempt_count,
      status: "failed",
      started_at: jobBefore.started_at ?? iso(now),
      finished_at: iso(now),
      error_code: input.error_code,
      error_message: input.error_message,
      metrics: {},
    });

    return job;
  }
}
