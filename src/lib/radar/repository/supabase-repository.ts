import type { SupabaseClient } from "@supabase/supabase-js";
import { InMemoryRadarRepository } from "./in-memory-repository";
import type { RadarRepository } from "./types";

/**
 * Production Supabase repository.
 * V1 delegates to SQL tables via service role; mirrors in-memory semantics.
 */
export class SupabaseRadarRepository extends InMemoryRadarRepository implements RadarRepository {
  constructor(private readonly client: SupabaseClient) {
    super();
  }

  override async listActiveMembers() {
    const { data, error } = await this.client.from("members").select("id").order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ member_id: String(row.id) }));
  }

  override async getMemberDailyTop20(member_id: string, snapshot_date: string) {
    const { data, error } = await this.client
      .from("member_daily_top20")
      .select("*")
      .eq("member_id", member_id)
      .eq("snapshot_date", snapshot_date)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      member_id: String(data.member_id),
      pipeline_run_id: data.pipeline_run_id ? String(data.pipeline_run_id) : null,
      snapshot_date: String(data.snapshot_date),
      generated_at: String(data.generated_at),
      item_count: Number(data.item_count),
      items: (data.items as never[]) ?? [],
    };
  }

  override async getMemberCandidateState(member_id: string, candidate_id: string) {
    const { data, error } = await this.client
      .from("member_candidate_state")
      .select("*")
      .eq("member_id", member_id)
      .eq("candidate_id", candidate_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      member_id: String(data.member_id),
      candidate_id: String(data.candidate_id),
      development_state: data.development_state,
      excluded_from_recommendations: Boolean(data.excluded_from_recommendations),
    };
  }

  override async setMemberDevelopmentState(input: {
    member_id: string;
    candidate_id: string;
    development_state: import("../jobs/constants").MemberDevelopmentState;
  }) {
    const { error } = await this.client.from("member_candidate_state").upsert({
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      development_state: input.development_state,
      excluded_from_recommendations: true,
      development_updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return super.setMemberDevelopmentState(input);
  }

  override async insertMemberDailyTop20(input: {
    id: string;
    member_id: string;
    pipeline_run_id: string;
    snapshot_date: string;
    generated_at: Date;
    items: import("../scoring/types").RankedCandidate[];
  }) {
    const record = await super.insertMemberDailyTop20(input);
    const { error } = await this.client.from("member_daily_top20").upsert({
      id: input.id,
      member_id: input.member_id,
      pipeline_run_id: input.pipeline_run_id,
      snapshot_date: input.snapshot_date,
      generated_at: input.generated_at.toISOString(),
      item_count: input.items.length,
      items: input.items,
    });
    if (error) throw new Error(error.message);
    return record;
  }

  override async upsertCandidate(input: Parameters<RadarRepository["upsertCandidate"]>[0]) {
    const record = await super.upsertCandidate(input);
    const { error } = await this.client.from("candidate_pool").upsert({
      id: input.id,
      display_name: record.display_name,
      primary_platform: record.primary_platform,
      lifecycle_state: record.lifecycle_state,
      profile_semantic_hash: record.profile_semantic_hash,
      normalized_username: record.normalized_username ?? null,
      acquisition_source: record.acquisition_source ?? "system_discovery",
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return record;
  }

  override async getCandidate(candidate_id: string) {
    const { data, error } = await this.client
      .from("candidate_pool")
      .select("*")
      .eq("id", candidate_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return super.getCandidate(candidate_id);
    return {
      id: String(data.id),
      display_name: data.display_name ? String(data.display_name) : null,
      primary_platform: data.primary_platform as "threads" | "instagram" | null,
      lifecycle_state: data.lifecycle_state as import("../jobs/constants").GlobalCandidateLifecycleState,
      profile_semantic_hash: data.profile_semantic_hash ? String(data.profile_semantic_hash) : null,
      normalized_username: data.normalized_username ? String(data.normalized_username) : null,
      acquisition_source: (data.acquisition_source as "system_discovery" | "member_provided") ?? "system_discovery",
    };
  }

  override async recordDiscovery(input: Parameters<RadarRepository["recordDiscovery"]>[0]) {
    await super.recordDiscovery(input);
    const { error } = await this.client.from("candidate_discoveries").insert({
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      keyword_id: input.keyword_id ?? null,
      keyword_phrase: input.keyword_phrase,
      org_keyword_phrase: input.org_keyword_phrase ?? null,
      discovery_source: input.discovery_source ?? "keyword_search",
      pipeline_run_id: input.pipeline_run_id ?? null,
      discovered_at: (input.discovered_at ?? new Date()).toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  override async recordMemberSubmission(
    input: Parameters<RadarRepository["recordMemberSubmission"]>[0],
  ) {
    await super.recordMemberSubmission(input);
    const { error } = await this.client.from("candidate_member_submissions").insert({
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      platform: input.platform,
      normalized_username: input.normalized_username,
      raw_input: input.raw_input,
      identity_resolution_result: input.identity_resolution_result,
      submitted_at: input.submitted_at.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  override async insertRawSnapshots(input: Parameters<RadarRepository["insertRawSnapshots"]>[0]) {
    const ids = await super.insertRawSnapshots(input);
    const rows = input.snapshots.map((snapshot) => ({
      id: snapshot.raw_snapshot_id,
      candidate_id: input.candidate_id,
      platform: input.platform,
      external_content_id: snapshot.external_content_id,
      adapter_version: snapshot.adapter_version,
      fetched_at: snapshot.fetched_at,
      fetch_completeness: snapshot.fetch_completeness,
      payload: snapshot.payload,
      pipeline_run_id: input.pipeline_run_id ?? null,
      enrich_job_id: input.enrich_job_id ?? null,
    }));
    const { error } = await this.client.from("candidate_content_snapshots_raw").upsert(rows);
    if (error) throw new Error(error.message);
    return ids;
  }

  override async persistNormalizationRun(corpus: import("../normalization/schema").CandidateContentCorpus) {
    await super.persistNormalizationRun(corpus);
    const { error: runError } = await this.client.from("candidate_normalization_runs").upsert({
      candidate_id: corpus.candidate_id,
      normalization_run_id: corpus.normalization_run_id,
      normalization_policy_version: corpus.normalization_policy_version,
      normalized_at: corpus.normalized_at,
      data_completeness: corpus.data_completeness,
      analysis_window_days: corpus.analysis_window_days,
      window_start_at: corpus.window_start_at,
      window_end_at: corpus.window_end_at,
      analyzable_item_count: corpus.counts.analyzable_item_count,
      last_meaningful_activity_at: corpus.last_meaningful_activity_at,
      counts: corpus.counts,
    });
    if (runError) throw new Error(runError.message);

    if (corpus.items.length > 0) {
      const { error: itemsError } = await this.client.from("candidate_content_normalized").upsert(
        corpus.items.map((item) => ({
          normalized_content_id: item.normalized_content_id,
          candidate_id: item.candidate_id,
          normalization_run_id: corpus.normalization_run_id,
          platform: item.platform,
          external_content_id: item.external_content_id,
          raw_snapshot_id: item.raw_snapshot_id,
          adapter_version: item.adapter_version,
          fetched_at: item.fetched_at,
          published_at: item.published_at,
          content_type: item.content_type,
          content_relationship: item.content_relationship,
          text: item.text,
          candidate_commentary_text: item.candidate_commentary_text,
          quoted_content: item.quoted_content,
          media: item.media,
          permalink: item.permalink,
          is_candidate_originated: item.is_candidate_originated,
          has_meaningful_expression: item.has_meaningful_expression,
          is_analyzable: item.is_analyzable,
          content_dedup_key: item.content_dedup_key,
          content_hash: item.content_hash,
          duplicate_of: item.duplicate_of,
          dedup_class: item.dedup_class,
          exclusion_reason: item.exclusion_reason,
          normalization_notes: item.normalization_notes,
        })),
      );
      if (itemsError) throw new Error(itemsError.message);
    }
  }

  override async insertAnalysisRun(input: Parameters<RadarRepository["insertAnalysisRun"]>[0]) {
    const record = await super.insertAnalysisRun(input);
    const { error } = await this.client.from("candidate_analysis_runs").insert({
      id: input.id,
      candidate_id: input.candidate_id,
      status: input.status,
      analysis_input_fingerprint: input.analysis_input_fingerprint,
      corpus_fingerprint: input.corpus_fingerprint,
      profile_semantic_hash: input.profile_semantic_hash,
      normalization_run_id: input.normalization_run_id,
      extraction_json: input.extraction_json,
      prompt_version: input.prompt_version,
      model_id: input.model_id,
      error_code: input.error_code,
      error_message: input.error_message,
    });
    if (error) throw new Error(error.message);
    return record;
  }

  override async getPipelineConfig() {
    const { data, error } = await this.client
      .from("radar_pipeline_config")
      .select("source_freshness_window_days, worker")
      .eq("id", "radar_daily_pipeline_v1")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      source_freshness_window_days: Number(data?.source_freshness_window_days ?? 7),
      worker: (data?.worker as Record<string, unknown>) ?? {},
    };
  }

  override async recordSourceFetchAudit(entry: Parameters<RadarRepository["recordSourceFetchAudit"]>[0]) {
    await super.recordSourceFetchAudit(entry);
    const { error } = await this.client.from("source_fetch_audit_log").insert({
      adapter_id: entry.adapter_id,
      endpoint: entry.endpoint,
      candidate_id: entry.candidate_id,
      member_id: entry.member_id,
      pipeline_run_id: entry.pipeline_run_id,
      job_id: entry.job_id,
      status: entry.status,
      error_code: entry.error_code,
      error_message: entry.error_message,
      metadata: entry.metadata ?? {},
    });
    if (error) throw new Error(error.message);
  }
}
