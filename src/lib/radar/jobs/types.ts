import type {
  PipelineRunStatus,
  RadarJobStatus,
  RadarJobType,
} from "./constants";

export type JsonObject = Record<string, unknown>;

export type RadarJobRecord = {
  id: string;
  pipeline_run_id: string | null;
  job_type: RadarJobType;
  idempotency_key: string;
  status: RadarJobStatus;
  payload: JsonObject;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  available_at: string;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
  trace_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineJobRunRecord = {
  id: string;
  pipeline_run_id: string | null;
  job_id: string;
  job_type: RadarJobType;
  attempt_number: number;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  error_code: string | null;
  error_message: string | null;
  metrics: JsonObject;
};

export type PipelineRunRecord = {
  id: string;
  run_date: string;
  timezone: string;
  triggered_by: string;
  status: PipelineRunStatus;
  config_version: string;
  counts: JsonObject;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

export type EnqueueJobInput = {
  pipeline_run_id?: string | null;
  job_type: RadarJobType;
  idempotency_key: string;
  payload?: JsonObject;
  priority?: number;
  max_attempts?: number;
  scheduled_at?: Date;
  available_at?: Date;
  trace_id?: string;
};

export type ClaimJobsOptions = {
  limit?: number;
  job_types?: RadarJobType[];
  now?: Date;
};

export type CompleteJobInput = {
  job_id: string;
  metrics?: JsonObject;
};

export type FailJobInput = {
  job_id: string;
  error_code: string;
  error_message: string;
  retryable: boolean;
  now?: Date;
};

export type RadarJobQueueStore = {
  findById(job_id: string): Promise<RadarJobRecord | null>;
  findByIdempotencyKey(idempotency_key: string): Promise<RadarJobRecord | null>;
  insertJob(input: EnqueueJobInput & { id: string; now: Date }): Promise<RadarJobRecord>;
  claimJobs(options: ClaimJobsOptions): Promise<RadarJobRecord[]>;
  markSucceeded(job_id: string, finished_at: Date): Promise<RadarJobRecord | null>;
  markFailed(input: {
    job_id: string;
    status: "failed" | "dead_letter";
    error_code: string;
    error_message: string;
    available_at: Date | null;
    finished_at: Date;
    max_attempts?: number;
  }): Promise<RadarJobRecord | null>;
  insertJobRun(input: Omit<PipelineJobRunRecord, "id"> & { id: string }): Promise<void>;
  updateJobRun(
    id: string,
    patch: Partial<Pick<PipelineJobRunRecord, "status" | "finished_at" | "error_code" | "error_message" | "metrics">>,
  ): Promise<void>;
};
