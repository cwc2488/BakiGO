import {
  DEFAULT_DAILY_QUOTA_BUDGET,
  type DailyQuotaBudget,
} from "./quota-allocator";
import type { CandidateRefreshInput } from "./types";
import type { PipelineRunView, PipelineStore } from "./store";
import type { RadarJobRecord } from "../jobs/types";

export class InMemoryPipelineStore implements PipelineStore {
  pipelineRuns = new Map<string, PipelineRunView>();
  refreshQueueByDate = new Map<string, unknown[]>();
  members: Array<{ member_id: string }> = [];
  keywordsByMember: Record<
    string,
    Array<{ keyword_id: string; phrase: string; discovery_weight: number }>
  > = {};
  refreshCandidates: CandidateRefreshInput[] = [];
  baselineQuota = 3;
  quotaBudget: DailyQuotaBudget = DEFAULT_DAILY_QUOTA_BUDGET;
  pipelineJobs = new Map<string, RadarJobRecord[]>();
  jobSink?: (job: RadarJobRecord) => void;

  trackJob(pipeline_run_id: string | null, job: RadarJobRecord): void {
    if (!pipeline_run_id) return;
    const list = this.pipelineJobs.get(pipeline_run_id) ?? [];
    const index = list.findIndex((row) => row.id === job.id);
    if (index === -1) list.push(job);
    else list[index] = job;
    this.pipelineJobs.set(pipeline_run_id, list);
    this.jobSink?.(job);
  }

  async listPipelineJobs(pipeline_run_id: string): Promise<RadarJobRecord[]> {
    return [...(this.pipelineJobs.get(pipeline_run_id) ?? [])];
  }

  async findPipelineRunByDate(run_date: string): Promise<PipelineRunView | null> {
    for (const run of this.pipelineRuns.values()) {
      if (run.run_date === run_date) return run;
    }
    return null;
  }

  async createPipelineRun(input: {
    id: string;
    run_date: string;
    timezone: string;
    triggered_by: string;
    now: Date;
  }): Promise<PipelineRunView> {
    const run: PipelineRunView = {
      id: input.id,
      run_date: input.run_date,
      timezone: input.timezone,
      triggered_by: input.triggered_by,
      status: "running",
      counts: {},
    };
    this.pipelineRuns.set(input.id, run);
    return run;
  }

  async markPipelineEnqueued(input: {
    pipeline_run_id: string;
    counts: PipelineRunView["counts"];
  }): Promise<void> {
    const run = this.pipelineRuns.get(input.pipeline_run_id);
    if (!run) return;
    run.status = "running";
    run.counts = input.counts;
  }

  async finalizePipelineRun(input: {
    pipeline_run_id: string;
    status: "success" | "partial_success" | "failed";
    counts?: PipelineRunView["counts"];
    finished_at: Date;
    error_message?: string | null;
  }): Promise<void> {
    const run = this.pipelineRuns.get(input.pipeline_run_id);
    if (!run) return;
    run.status = input.status;
    if (input.counts) run.counts = { ...run.counts, ...input.counts };
  }

  async listActiveMembers(): Promise<Array<{ member_id: string }>> {
    return this.members;
  }

  async loadKeywordsByMember(
    member_ids: string[],
  ): Promise<
    Record<string, Array<{ keyword_id: string; phrase: string; discovery_weight: number }>>
  > {
    const result: Record<
      string,
      Array<{ keyword_id: string; phrase: string; discovery_weight: number }>
    > = {};
    for (const member_id of member_ids) {
      result[member_id] = this.keywordsByMember[member_id] ?? [];
    }
    return result;
  }

  async getBaselineDiscoveryQuota(): Promise<number> {
    return this.baselineQuota;
  }

  async getDailyQuotaBudget(): Promise<DailyQuotaBudget> {
    return this.quotaBudget;
  }

  async listRefreshCandidates(
    _run_date: string,
    _now: Date,
  ): Promise<CandidateRefreshInput[]> {
    return this.refreshCandidates;
  }

  async saveRefreshQueue(input: {
    queue_date: string;
    pipeline_run_id: string;
    items: unknown[];
  }): Promise<void> {
    this.refreshQueueByDate.set(input.queue_date, input.items);
  }
}
