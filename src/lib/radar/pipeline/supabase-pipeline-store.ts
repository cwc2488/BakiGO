import type { SupabaseClient } from "@supabase/supabase-js";
import { RADAR_DAILY_PIPELINE_ID } from "../jobs/constants";
import {
  DEFAULT_DAILY_QUOTA_BUDGET,
  parseDailyQuotaBudget,
  type DailyQuotaBudget,
} from "./quota-allocator";
import type { CandidateRefreshInput } from "./types";
import type { PipelineRunView, PipelineStore } from "./store";

const DEFAULT_BASELINE_QUOTA = 3;
const DEFAULT_COOLING_INTERVAL_DAYS = 14;
const REFRESH_CANDIDATE_LIMIT = 500;

function mapPipelineRun(row: Record<string, unknown>): PipelineRunView {
  const counts = (row.counts as PipelineRunView["counts"]) ?? {};
  return {
    id: String(row.id),
    run_date: String(row.run_date),
    timezone: String(row.timezone ?? "Asia/Taipei"),
    triggered_by: String(row.triggered_by ?? "cron"),
    status: row.status as PipelineRunView["status"],
    counts,
  };
}

function mapRefreshCandidate(row: Record<string, unknown>): CandidateRefreshInput {
  return {
    candidate_id: String(row.candidate_id),
    lifecycle_state: row.lifecycle_state as CandidateRefreshInput["lifecycle_state"],
    refresh_tier: row.refresh_tier as CandidateRefreshInput["refresh_tier"],
    is_new_candidate: Boolean(row.is_new_candidate),
    source_freshness_expired: Boolean(row.source_freshness_expired),
    is_stale_recovery: Boolean(row.is_stale_recovery),
    near_top20_competitive: Boolean(row.near_top20_competitive),
    new_discovery_hit: Boolean(row.new_discovery_hit),
    force_refresh: Boolean(row.force_refresh),
    last_enriched_at: row.last_enriched_at ? String(row.last_enriched_at) : null,
    cooling_interval_days: Number(row.cooling_interval_days ?? DEFAULT_COOLING_INTERVAL_DAYS),
  };
}

export class SupabasePipelineStore implements PipelineStore {
  constructor(private readonly client: SupabaseClient) {}

  async findPipelineRunByDate(run_date: string): Promise<PipelineRunView | null> {
    const { data, error } = await this.client
      .from("radar_pipeline_runs")
      .select("*")
      .eq("run_date", run_date)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? mapPipelineRun(data) : null;
  }

  async createPipelineRun(input: {
    id: string;
    run_date: string;
    timezone: string;
    triggered_by: string;
    now: Date;
  }): Promise<PipelineRunView> {
    const { data, error } = await this.client
      .from("radar_pipeline_runs")
      .insert({
        id: input.id,
        run_date: input.run_date,
        timezone: input.timezone,
        triggered_by: input.triggered_by,
        status: "running",
        config_version: RADAR_DAILY_PIPELINE_ID,
        counts: {},
        started_at: input.now.toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const existing = await this.findPipelineRunByDate(input.run_date);
        if (existing) return existing;
      }
      throw new Error(error.message);
    }

    return mapPipelineRun(data);
  }

  async finalizePipelineRun(input: {
    pipeline_run_id: string;
    status: "success" | "partial_success" | "failed";
    counts?: PipelineRunView["counts"];
    finished_at: Date;
    error_message?: string | null;
  }): Promise<void> {
    const patch: Record<string, unknown> = {
      status: input.status,
      finished_at: input.finished_at.toISOString(),
    };
    if (input.counts) patch.counts = input.counts;
    if (input.error_message !== undefined) patch.error_message = input.error_message;

    const { error } = await this.client
      .from("radar_pipeline_runs")
      .update(patch)
      .eq("id", input.pipeline_run_id);

    if (error) throw new Error(error.message);
  }

  async markPipelineEnqueued(input: {
    pipeline_run_id: string;
    counts: PipelineRunView["counts"];
  }): Promise<void> {
    const { error } = await this.client
      .from("radar_pipeline_runs")
      .update({
        status: "running",
        counts: input.counts,
      })
      .eq("id", input.pipeline_run_id);

    if (error) throw new Error(error.message);
  }

  async listPipelineJobs(pipeline_run_id: string): Promise<import("../jobs/types").RadarJobRecord[]> {
    const { data, error } = await this.client
      .from("radar_jobs")
      .select("*")
      .eq("pipeline_run_id", pipeline_run_id);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      id: String(row.id),
      pipeline_run_id: row.pipeline_run_id ? String(row.pipeline_run_id) : null,
      job_type: row.job_type,
      idempotency_key: String(row.idempotency_key),
      status: row.status,
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
    }));
  }

  async listActiveMembers(): Promise<Array<{ member_id: string }>> {
    const { data, error } = await this.client
      .from("members")
      .select("id")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ member_id: String(row.id) }));
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
      result[member_id] = [];
    }
    if (member_ids.length === 0) return result;

    const [systemKeywords, memberKeywords, disabledRows] = await Promise.all([
      this.client
        .from("radar_system_keywords")
        .select("id, phrase, discovery_weight")
        .eq("is_active", true),
      this.client
        .from("radar_member_keywords")
        .select("id, member_id, phrase, discovery_weight")
        .in("member_id", member_ids)
        .eq("is_active", true),
      this.client
        .from("radar_member_keyword_disabled")
        .select("member_id, system_keyword_id")
        .in("member_id", member_ids),
    ]);

    if (systemKeywords.error) throw new Error(systemKeywords.error.message);
    if (memberKeywords.error) throw new Error(memberKeywords.error.message);
    if (disabledRows.error) throw new Error(disabledRows.error.message);

    const disabledByMember = new Map<string, Set<string>>();
    for (const row of disabledRows.data ?? []) {
      const member_id = String(row.member_id);
      const set = disabledByMember.get(member_id) ?? new Set<string>();
      set.add(String(row.system_keyword_id));
      disabledByMember.set(member_id, set);
    }

    for (const member_id of member_ids) {
      const disabled = disabledByMember.get(member_id) ?? new Set<string>();
      const merged = [
        ...(systemKeywords.data ?? [])
          .filter((keyword) => !disabled.has(String(keyword.id)))
          .map((keyword) => ({
            keyword_id: String(keyword.id),
            phrase: String(keyword.phrase),
            discovery_weight: Number(keyword.discovery_weight ?? 1),
          })),
        ...(memberKeywords.data ?? [])
          .filter((keyword) => String(keyword.member_id) === member_id)
          .map((keyword) => ({
            keyword_id: String(keyword.id),
            phrase: String(keyword.phrase),
            discovery_weight: Number(keyword.discovery_weight ?? 1),
          })),
      ];
      result[member_id] = merged;
    }

    return result;
  }

  async getBaselineDiscoveryQuota(): Promise<number> {
    const { data, error } = await this.client
      .from("radar_pipeline_config")
      .select("daily_caps")
      .eq("id", RADAR_DAILY_PIPELINE_ID)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const caps = (data?.daily_caps as Record<string, unknown>) ?? {};
    const quota = caps.baseline_discovery_quota_per_member;
    return typeof quota === "number" ? quota : DEFAULT_BASELINE_QUOTA;
  }

  async getDailyQuotaBudget(): Promise<DailyQuotaBudget> {
    const { data, error } = await this.client
      .from("radar_pipeline_config")
      .select("daily_caps")
      .eq("id", RADAR_DAILY_PIPELINE_ID)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const caps = (data?.daily_caps as Record<string, unknown>) ?? {};
    return parseDailyQuotaBudget(caps);
  }

  async listRefreshCandidates(_run_date: string, now: Date): Promise<CandidateRefreshInput[]> {
    const { data, error } = await this.client.rpc("list_adaptive_refresh_candidates", {
      p_now: now.toISOString(),
      p_limit: REFRESH_CANDIDATE_LIMIT,
    });

    if (error) throw new Error(error.message);
    return (data ?? []).map((row: Record<string, unknown>) => mapRefreshCandidate(row));
  }

  async saveRefreshQueue(input: {
    queue_date: string;
    pipeline_run_id: string;
    items: Array<{
      candidate_id: string;
      priority_score: number;
      reason_codes: string[];
      planned_phases: string[];
    }>;
  }): Promise<void> {
    if (input.items.length === 0) return;

    const rows = input.items.map((item) => ({
      queue_date: input.queue_date,
      candidate_id: item.candidate_id,
      priority_score: item.priority_score,
      reason_codes: item.reason_codes,
      planned_phases: item.planned_phases,
      status: "queued",
      pipeline_run_id: input.pipeline_run_id,
    }));

    const { error } = await this.client
      .from("candidate_refresh_queue")
      .upsert(rows, { onConflict: "queue_date,candidate_id" });

    if (error) throw new Error(error.message);
  }
}
