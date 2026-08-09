import type { DailyQuotaBudget } from "./quota-allocator";
import type { RefreshQueueItem } from "./types";

export type PipelineRunView = {
  id: string;
  run_date: string;
  timezone: string;
  triggered_by: string;
  status: "pending" | "running" | "success" | "partial_success" | "failed";
  counts: {
    enqueued?: boolean;
    discovery_jobs?: number;
    refresh_candidates?: number;
    enrich_jobs?: number;
    normalize_jobs?: number;
    quota_allocation?: Record<string, number>;
  };
};

export type PipelineStore = {
  findPipelineRunByDate(run_date: string): Promise<PipelineRunView | null>;
  createPipelineRun(input: {
    id: string;
    run_date: string;
    timezone: string;
    triggered_by: string;
    now: Date;
  }): Promise<PipelineRunView>;
  markPipelineEnqueued(input: {
    pipeline_run_id: string;
    counts: PipelineRunView["counts"];
  }): Promise<void>;
  finalizePipelineRun(input: {
    pipeline_run_id: string;
    status: "success" | "partial_success" | "failed";
    counts?: PipelineRunView["counts"];
    finished_at: Date;
    error_message?: string | null;
  }): Promise<void>;
  listPipelineJobs(pipeline_run_id: string): Promise<import("../jobs/types").RadarJobRecord[]>;
  listActiveMembers(): Promise<Array<{ member_id: string }>>;
  loadKeywordsByMember(
    member_ids: string[],
  ): Promise<
    Record<string, Array<{ keyword_id: string; phrase: string; discovery_weight: number }>>
  >;
  getBaselineDiscoveryQuota(): Promise<number>;
  getDailyQuotaBudget(): Promise<DailyQuotaBudget>;
  listRefreshCandidates(run_date: string, now: Date): Promise<
    import("./types").CandidateRefreshInput[]
  >;
  saveRefreshQueue(input: {
    queue_date: string;
    pipeline_run_id: string;
    items: RefreshQueueItem[];
  }): Promise<void>;
};
