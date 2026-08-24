import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeAllocatableAt } from "../allocation/allocation-rules";
import { InMemoryRadarRepository } from "./in-memory-repository";
import {
  assembleCorpusFromRows,
  isUuid,
  mapAnalysisRunRow,
  mapRawSnapshotRow,
  mapRefreshStateRow,
} from "./supabase-mappers";
import type { MemberRadarRecommendationFeedback } from "../feedback/types";
import type { MemberRadarRegionPreference } from "../semantics/region-preference";
import type { CandidateDevelopmentClaimRecord, RadarRepository } from "./types";

function mapClaimRow(row: Record<string, unknown>): CandidateDevelopmentClaimRecord {
  return {
    candidate_id: String(row.candidate_id),
    member_id: String(row.member_id),
    claimed_at: String(row.claimed_at),
    expires_at: String(row.expires_at),
    allocatable_at: String(row.allocatable_at),
    released_at: row.released_at ? String(row.released_at) : null,
    release_reason: (row.release_reason ??
      null) as CandidateDevelopmentClaimRecord["release_reason"],
  };
}

function mapFeedbackRow(row: Record<string, unknown>): MemberRadarRecommendationFeedback {
  return {
    id: String(row.id),
    member_id: String(row.member_id),
    candidate_id: String(row.candidate_id),
    recommendation_date: String(row.recommendation_date),
    feedback: row.feedback as MemberRadarRecommendationFeedback["feedback"],
    rejection_reason: (row.rejection_reason ??
      null) as MemberRadarRecommendationFeedback["rejection_reason"],
    optional_note: row.optional_note ? String(row.optional_note) : null,
    evaluation_context: (row.evaluation_context ??
      {}) as MemberRadarRecommendationFeedback["evaluation_context"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

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
      exclusion_reason_code: data.exclusion_reason_code ? String(data.exclusion_reason_code) : null,
      skip_expires_at: data.skip_expires_at ? String(data.skip_expires_at) : null,
    };
  }

  override async setMemberDevelopmentState(input: {
    member_id: string;
    candidate_id: string;
    development_state: import("../jobs/constants").MemberDevelopmentState;
  }) {
    await this.setMemberCandidateState({
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      development_state: input.development_state,
      excluded_from_recommendations: true,
      exclusion_reason_code: null,
    });
  }

  override async setMemberCandidateState(input: {
    member_id: string;
    candidate_id: string;
    development_state: import("../jobs/constants").MemberDevelopmentState | null;
    excluded_from_recommendations: boolean;
    exclusion_reason_code?: string | null;
    skip_expires_at?: Date | null;
  }) {
    const now = new Date().toISOString();
    const { error } = await this.client.from("member_candidate_state").upsert(
      {
        member_id: input.member_id,
        candidate_id: input.candidate_id,
        development_state: input.development_state,
        excluded_from_recommendations: input.excluded_from_recommendations,
        exclusion_reason_code: input.exclusion_reason_code ?? null,
        skip_expires_at: input.skip_expires_at ? input.skip_expires_at.toISOString() : null,
        development_started_at: input.development_state === "in_progress" ? now : undefined,
        development_updated_at: now,
        updated_at: now,
      },
      { onConflict: "member_id,candidate_id" },
    );
    if (error) throw new Error(error.message);
    await super.setMemberCandidateState(input);
  }

  override async listCandidateDevelopmentClaims(candidate_ids: string[]) {
    if (candidate_ids.length === 0) return [];
    const { data, error } = await this.client
      .from("candidate_development_claims")
      .select("candidate_id, member_id, claimed_at, expires_at, allocatable_at, released_at, release_reason")
      .in("candidate_id", candidate_ids);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapClaimRow(row));
  }

  override async getCandidateDevelopmentClaim(candidate_id: string) {
    const { data, error } = await this.client
      .from("candidate_development_claims")
      .select("candidate_id, member_id, claimed_at, expires_at, allocatable_at, released_at, release_reason")
      .eq("candidate_id", candidate_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapClaimRow(data) : null;
  }

  /**
   * The database decides, in one statement, against its own clock — `now` is
   * only what the in-memory twin needs. Zero rows back means the candidate is
   * locked; the caller learns nothing about who holds it.
   */
  override async claimCandidateDevelopment(input: {
    candidate_id: string;
    member_id: string;
    expires_at: Date;
    allocatable_at: import("../allocation/allocation-rules").AllocatableAt;
    rules_version: string;
    now: Date;
  }) {
    const { data, error } = await this.client.rpc("claim_candidate_development", {
      p_candidate_id: input.candidate_id,
      p_member_id: input.member_id,
      p_expires_at: input.expires_at.toISOString(),
      p_allocatable_at: serializeAllocatableAt(input.allocatable_at),
      p_rules_version: input.rules_version,
    });
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<Record<string, unknown>>;
    return rows[0] ? mapClaimRow(rows[0]) : null;
  }

  override async releaseCandidateDevelopmentClaim(input: {
    candidate_id: string;
    member_id: string;
    released_at: Date;
    release_reason: "failed" | "gave_up" | "converted";
    allocatable_at: import("../allocation/allocation-rules").AllocatableAt;
  }) {
    const { data, error } = await this.client
      .from("candidate_development_claims")
      .update({
        released_at: input.released_at.toISOString(),
        release_reason: input.release_reason,
        allocatable_at: serializeAllocatableAt(input.allocatable_at),
        updated_at: new Date().toISOString(),
      })
      .eq("candidate_id", input.candidate_id)
      .eq("member_id", input.member_id)
      .is("released_at", null)
      .select("candidate_id, member_id, claimed_at, expires_at, allocatable_at, released_at, release_reason");
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0];
    return row ? mapClaimRow(row) : null;
  }

  /**
   * Upserts on the natural key `(member_id, snapshot_date)`, which is the
   * constraint a same-day re-run used to break. `id` is deliberately absent
   * from the payload: on conflict PostgREST only writes the columns it is
   * given, so the existing snapshot id survives and the occurrences pointing at
   * it keep their lineage. Sending a fresh id would instead try to rewrite the
   * primary key and be rejected by that foreign key.
   */
  override async upsertMemberDailyTop20(input: {
    member_id: string;
    pipeline_run_id: string;
    snapshot_date: string;
    generated_at: Date;
    items: import("../scoring/types").RankedCandidate[];
  }) {
    const { data, error } = await this.client
      .from("member_daily_top20")
      .upsert(
        {
          member_id: input.member_id,
          pipeline_run_id: input.pipeline_run_id || null,
          snapshot_date: input.snapshot_date,
          generated_at: input.generated_at.toISOString(),
          item_count: input.items.length,
          items: input.items,
        },
        { onConflict: "member_id,snapshot_date" },
      )
      .select("id, member_id, pipeline_run_id, snapshot_date, generated_at, item_count, items")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: String(data.id),
      member_id: String(data.member_id),
      pipeline_run_id: data.pipeline_run_id ? String(data.pipeline_run_id) : null,
      snapshot_date: String(data.snapshot_date),
      generated_at: String(data.generated_at),
      item_count: Number(data.item_count),
      items: (data.items ?? []) as import("../scoring/types").RankedCandidate[],
    };
  }

  override async upsertCandidate(input: Parameters<RadarRepository["upsertCandidate"]>[0]) {
    // Serverless workers start with an empty in-memory cache. Merge the
    // persisted row first so a hash-only enrich update cannot wipe username.
    const existing = await this.getCandidate(input.id);
    const record = await super.upsertCandidate({
      ...input,
      display_name: input.display_name !== undefined ? input.display_name : existing?.display_name,
      primary_platform:
        input.primary_platform !== undefined ? input.primary_platform : existing?.primary_platform,
      lifecycle_state:
        input.lifecycle_state !== undefined ? input.lifecycle_state : existing?.lifecycle_state,
      profile_semantic_hash:
        input.profile_semantic_hash !== undefined
          ? input.profile_semantic_hash
          : existing?.profile_semantic_hash,
      normalized_username:
        input.normalized_username !== undefined
          ? input.normalized_username
          : existing?.normalized_username,
      acquisition_source:
        input.acquisition_source !== undefined
          ? input.acquisition_source
          : existing?.acquisition_source,
    });
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
    if (!data) return null;
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
    if (input.snapshots.length === 0) return ids;
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
    const { error: runError } = await this.client.from("candidate_normalization_runs").upsert(
      {
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
      },
      { onConflict: "normalization_run_id" },
    );
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
        { onConflict: "normalized_content_id" },
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
      .select("source_freshness_window_days, worker, allocation")
      .eq("id", "radar_daily_pipeline_v1")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      source_freshness_window_days: Number(data?.source_freshness_window_days ?? 7),
      worker: (data?.worker as Record<string, unknown>) ?? {},
      allocation: (data?.allocation as Record<string, unknown>) ?? {},
    };
  }

  override async upsertDiscoverySignal(input: Parameters<RadarRepository["upsertDiscoverySignal"]>[0]) {
    await super.upsertDiscoverySignal(input);
    const { error } = await this.client.from("candidate_discovery_signals").insert({
      candidate_id: input.candidate_id,
      signal_type: input.signal_type,
      expires_at: input.expires_at.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  override async updateRefreshStateAfterEnrich(
    input: Parameters<RadarRepository["updateRefreshStateAfterEnrich"]>[0],
  ) {
    await super.updateRefreshStateAfterEnrich(input);
    const { error } = await this.client.from("candidate_refresh_state").upsert({
      candidate_id: input.candidate_id,
      last_source_check_at: input.now.toISOString(),
      last_enrich_succeeded_at: input.succeeded ? input.now.toISOString() : undefined,
      source_freshness_valid_until: input.source_freshness_valid_until?.toISOString() ?? null,
      data_completeness: input.fetch_completeness ?? null,
      profile_semantic_hash: input.profile_semantic_hash ?? null,
      enrichment_capability_state: input.enrichment_capability_state ?? null,
      updated_at: input.now.toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  override async recordSourceFetchAudit(entry: Parameters<RadarRepository["recordSourceFetchAudit"]>[0]) {
    await super.recordSourceFetchAudit(entry);
    const memberId =
      typeof entry.member_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.member_id)
        ? entry.member_id
        : null;
    const { error } = await this.client.from("source_fetch_audit_log").insert({
      adapter_id: entry.adapter_id,
      endpoint: entry.endpoint,
      candidate_id: entry.candidate_id ?? null,
      member_id: memberId,
      pipeline_run_id: entry.pipeline_run_id ?? null,
      job_id: entry.job_id ?? null,
      status: entry.status,
      error_code: entry.error_code,
      error_message: entry.error_message,
      metadata: entry.metadata ?? {},
    });
    if (error) throw new Error(error.message);
  }

  override async listRawSnapshotsByIds(raw_snapshot_ids: string[]) {
    if (raw_snapshot_ids.length === 0) return [];
    const { data, error } = await this.client
      .from("candidate_content_snapshots_raw")
      .select(
        "id, candidate_id, platform, external_content_id, adapter_version, fetch_completeness, payload, fetched_at",
      )
      .in("id", raw_snapshot_ids);
    if (error) throw new Error(error.message);
    const byId = new Map((data ?? []).map((row) => [String(row.id), mapRawSnapshotRow(row)]));
    return raw_snapshot_ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((row) => row as never);
  }

  override async updateRefreshStateAfterNormalize(
    input: Parameters<RadarRepository["updateRefreshStateAfterNormalize"]>[0],
  ) {
    const row: Record<string, unknown> = {
      candidate_id: input.candidate_id,
      last_normalization_succeeded_at: input.now.toISOString(),
      corpus_fingerprint: input.corpus_fingerprint,
      profile_semantic_hash: input.profile_semantic_hash,
      data_completeness: input.data_completeness,
      force_reanalysis: false,
      updated_at: input.now.toISOString(),
    };
    if (input.current_analysis_run_id !== undefined) {
      row.current_analysis_run_id = isUuid(input.current_analysis_run_id)
        ? input.current_analysis_run_id
        : null;
    }
    if (input.validated_extraction_fingerprint !== undefined) {
      row.validated_extraction_fingerprint = input.validated_extraction_fingerprint;
    }
    const { error } = await this.client.from("candidate_refresh_state").upsert(row);
    if (error) throw new Error(error.message);
  }

  override async getRefreshState(candidate_id: string) {
    const { data, error } = await this.client
      .from("candidate_refresh_state")
      .select("*")
      .eq("candidate_id", candidate_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapRefreshStateRow(data);
  }

  override async getNormalizationRun(normalization_run_id: string) {
    const { data: run, error: runError } = await this.client
      .from("candidate_normalization_runs")
      .select("*")
      .eq("normalization_run_id", normalization_run_id)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!run) return null;
    const { data: items, error: itemsError } = await this.client
      .from("candidate_content_normalized")
      .select("*")
      .eq("normalization_run_id", normalization_run_id);
    if (itemsError) throw new Error(itemsError.message);
    return assembleCorpusFromRows(run, items ?? []);
  }

  override async getLatestNormalizationRun(candidate_id: string) {
    const { data: run, error: runError } = await this.client
      .from("candidate_normalization_runs")
      .select("*")
      .eq("candidate_id", candidate_id)
      .order("normalized_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    if (!run) return null;
    return this.getNormalizationRun(String(run.normalization_run_id));
  }

  override async findSuccessfulAnalysisByFingerprint(input: {
    candidate_id: string;
    analysis_input_fingerprint: string;
  }) {
    const { data, error } = await this.client
      .from("candidate_analysis_runs")
      .select("*")
      .eq("candidate_id", input.candidate_id)
      .eq("analysis_input_fingerprint", input.analysis_input_fingerprint)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapAnalysisRunRow(data);
  }

  override async getAnalysisRun(analysis_run_id: string) {
    const { data, error } = await this.client
      .from("candidate_analysis_runs")
      .select("*")
      .eq("id", analysis_run_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapAnalysisRunRow(data);
  }

  override async insertBaselineScoreSnapshot(
    input: Parameters<RadarRepository["insertBaselineScoreSnapshot"]>[0],
  ) {
    const { error } = await this.client.from("candidate_baseline_score_snapshots").insert({
      id: input.id,
      candidate_id: input.candidate_id,
      analysis_run_id: input.analysis_run_id,
      overall_score: input.overall_score,
      component_scores: input.component_scores,
      core_traits_audit: input.core_traits_audit,
    });
    if (error) throw new Error(error.message);
    return input.id;
  }

  override async insertMemberScoreSnapshot(
    input: Parameters<RadarRepository["insertMemberScoreSnapshot"]>[0],
  ) {
    const { error } = await this.client.from("radar_candidate_score_snapshots").insert({
      id: input.id,
      candidate_id: null,
      member_id: input.member_id,
      candidate_id_text: input.candidate_id,
      analysis_run_id: input.analysis_run_id,
      baseline_score_snapshot_id: input.baseline_score_snapshot_id,
      overall_score: input.overall_score,
      component_scores: input.component_scores,
      extraction_snapshot: {
        snapshot_date: input.snapshot_date ?? null,
        location_level: input.location_level,
        result: input.result ?? null,
      },
    });
    if (error) throw new Error(error.message);
  }

  override async getMemberRadarRegionPreference(member_id: string) {
    const { data, error } = await this.client
      .from("member_radar_region_preferences")
      .select(
        "member_id, current_city, current_district, pending_city, pending_district, pending_effective_date, updated_at",
      )
      .eq("member_id", member_id)
      .maybeSingle();
    if (error) {
      if (error.code === "PGRST205" || error.message.includes("does not exist")) {
        return null;
      }
      throw new Error(error.message);
    }
    if (!data) return null;
    return {
      member_id: String(data.member_id),
      current_city: data.current_city ? String(data.current_city) : null,
      current_district: data.current_district ? String(data.current_district) : null,
      pending_city: data.pending_city ? String(data.pending_city) : null,
      pending_district: data.pending_district ? String(data.pending_district) : null,
      pending_effective_date: data.pending_effective_date
        ? String(data.pending_effective_date)
        : null,
      updated_at: String(data.updated_at),
    };
  }

  override async upsertMemberRadarRegionPreference(
    preference: MemberRadarRegionPreference,
  ) {
    const { error } = await this.client.from("member_radar_region_preferences").upsert(
      {
        member_id: preference.member_id,
        current_city: preference.current_city,
        current_district: preference.current_district,
        pending_city: preference.pending_city,
        pending_district: preference.pending_district,
        pending_effective_date: preference.pending_effective_date,
        updated_at: preference.updated_at,
      },
      { onConflict: "member_id" },
    );
    if (error) throw new Error(error.message);
    return preference;
  }

  override async getMemberRadarRecommendationFeedback(input: {
    member_id: string;
    candidate_id: string;
    recommendation_date: string;
  }) {
    const { data, error } = await this.client
      .from("member_radar_recommendation_feedback")
      .select(
        "id, member_id, candidate_id, recommendation_date, feedback, rejection_reason, optional_note, evaluation_context, created_at, updated_at",
      )
      .eq("member_id", input.member_id)
      .eq("candidate_id", input.candidate_id)
      .eq("recommendation_date", input.recommendation_date)
      .maybeSingle();
    if (error) {
      if (error.code === "PGRST205" || error.message.includes("does not exist")) {
        return null;
      }
      throw new Error(error.message);
    }
    if (!data) return null;
    return mapFeedbackRow(data);
  }

  override async listMemberRadarRecommendationFeedback(input: {
    member_id: string;
    recommendation_date: string;
  }) {
    const { data, error } = await this.client
      .from("member_radar_recommendation_feedback")
      .select(
        "id, member_id, candidate_id, recommendation_date, feedback, rejection_reason, optional_note, evaluation_context, created_at, updated_at",
      )
      .eq("member_id", input.member_id)
      .eq("recommendation_date", input.recommendation_date);
    if (error) {
      if (error.code === "PGRST205" || error.message.includes("does not exist")) {
        return [];
      }
      throw new Error(error.message);
    }
    return (data ?? []).map(mapFeedbackRow);
  }

  override async upsertMemberRadarRecommendationFeedback(
    feedback: import("../feedback/types").MemberRadarRecommendationFeedback,
  ) {
    const { error } = await this.client.from("member_radar_recommendation_feedback").upsert(
      {
        id: feedback.id,
        member_id: feedback.member_id,
        candidate_id: feedback.candidate_id,
        recommendation_date: feedback.recommendation_date,
        feedback: feedback.feedback,
        rejection_reason: feedback.rejection_reason,
        optional_note: feedback.optional_note,
        evaluation_context: feedback.evaluation_context,
        created_at: feedback.created_at,
        updated_at: feedback.updated_at,
      },
      { onConflict: "member_id,candidate_id,recommendation_date" },
    );
    if (error) throw new Error(error.message);
    return feedback;
  }

  override async getMemberDevelopmentAreas(member_id: string) {
    const { data, error } = await this.client
      .from("member_development_areas")
      .select("member_id, area_role, normalized_city, normalized_district, sort_order")
      .eq("member_id", member_id)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      member_id: String(row.member_id),
      area_role: row.area_role as "primary" | "secondary",
      normalized_city: row.normalized_city ? String(row.normalized_city) : null,
      normalized_district: row.normalized_district ? String(row.normalized_district) : null,
      sort_order: Number(row.sort_order ?? 0),
    }));
  }

  override async listMemberCandidateStates(member_id: string) {
    const { data, error } = await this.client
      .from("member_candidate_state")
      .select(
        "member_id, candidate_id, development_state, excluded_from_recommendations, exclusion_reason_code, skip_expires_at",
      )
      .eq("member_id", member_id);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      member_id: String(row.member_id),
      candidate_id: String(row.candidate_id),
      development_state: row.development_state,
      excluded_from_recommendations: Boolean(row.excluded_from_recommendations),
      exclusion_reason_code: row.exclusion_reason_code ? String(row.exclusion_reason_code) : null,
      skip_expires_at: row.skip_expires_at ? String(row.skip_expires_at) : null,
    }));
  }

  override async initMemberScoreProgress(
    input: Parameters<RadarRepository["initMemberScoreProgress"]>[0],
  ) {
    const { data, error } = await this.client
      .from("radar_member_score_progress")
      .select("expected_score_jobs, terminal_score_jobs, rank_enqueued")
      .eq("pipeline_run_id", input.pipeline_run_id)
      .eq("member_id", input.member_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const expected = Number(data?.expected_score_jobs ?? 0) + input.expected_score_jobs;
    const { error: writeError } = await this.client.from("radar_member_score_progress").upsert({
      pipeline_run_id: input.pipeline_run_id,
      member_id: input.member_id,
      expected_score_jobs: expected,
      terminal_score_jobs: Number(data?.terminal_score_jobs ?? 0),
      rank_enqueued: Boolean(data?.rank_enqueued),
      updated_at: new Date().toISOString(),
    });
    if (writeError) throw new Error(writeError.message);
  }

  override async incrementMemberScoreProgress(
    input: Parameters<RadarRepository["incrementMemberScoreProgress"]>[0],
  ) {
    const { data, error } = await this.client
      .from("radar_member_score_progress")
      .select("expected_score_jobs, terminal_score_jobs, rank_enqueued")
      .eq("pipeline_run_id", input.pipeline_run_id)
      .eq("member_id", input.member_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const terminal = Number(data?.terminal_score_jobs ?? 0) + 1;
    const expected = Number(data?.expected_score_jobs ?? 0);
    const rank_enqueued = Boolean(data?.rank_enqueued);
    const { error: writeError } = await this.client.from("radar_member_score_progress").upsert({
      pipeline_run_id: input.pipeline_run_id,
      member_id: input.member_id,
      expected_score_jobs: expected,
      terminal_score_jobs: terminal,
      rank_enqueued,
      updated_at: new Date().toISOString(),
    });
    if (writeError) throw new Error(writeError.message);
    return { terminal_score_jobs: terminal, expected_score_jobs: expected, rank_enqueued };
  }

  override async markMemberRankEnqueued(
    input: Parameters<RadarRepository["markMemberRankEnqueued"]>[0],
  ) {
    const { error } = await this.client
      .from("radar_member_score_progress")
      .update({ rank_enqueued: true, updated_at: new Date().toISOString() })
      .eq("pipeline_run_id", input.pipeline_run_id)
      .eq("member_id", input.member_id);
    if (error) throw new Error(error.message);
  }

  override async shouldEnqueueRank(input: Parameters<RadarRepository["shouldEnqueueRank"]>[0]) {
    const { data, error } = await this.client
      .from("radar_member_score_progress")
      .select("expected_score_jobs, terminal_score_jobs, rank_enqueued")
      .eq("pipeline_run_id", input.pipeline_run_id)
      .eq("member_id", input.member_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.rank_enqueued) return false;
    return Number(data.terminal_score_jobs) >= Number(data.expected_score_jobs);
  }

  override async listRecommendedCandidateIds(input: {
    member_id: string;
    snapshot_date: string;
  }) {
    const { data, error } = await this.client
      .from("member_recommendation_occurrences")
      .select("candidate_id")
      .eq("member_id", input.member_id)
      .eq("snapshot_date", input.snapshot_date);
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((row) => String(row.candidate_id)))];
  }

  override async appendRecommendationOccurrences(
    input: Parameters<RadarRepository["appendRecommendationOccurrences"]>[0],
  ) {
    if (input.items.length === 0) return { appended: 0, skipped_existing: 0 };

    // The table is append-only and has no natural-key constraint, because a
    // genuine same-day re-recommendation is a legitimate second row. A re-run is
    // not, so already-recorded candidates are filtered out here.
    const { data: existing, error: existingError } = await this.client
      .from("member_recommendation_occurrences")
      .select("candidate_id")
      .eq("member_id", input.member_id)
      .eq("snapshot_date", input.snapshot_date);
    if (existingError) throw new Error(existingError.message);
    const alreadyRecorded = new Set((existing ?? []).map((row) => String(row.candidate_id)));

    const pending = input.items.filter(
      (item) =>
        !alreadyRecorded.has(item.candidateId) ||
        Boolean(input.re_recommendation?.[item.candidateId]),
    );
    const skipped_existing = input.items.length - pending.length;
    if (pending.length === 0) return { appended: 0, skipped_existing };

    const rows = pending.map((item) => {
      const analysisId = input.analysis_run_ids[item.candidateId];
      return {
        member_id: input.member_id,
        candidate_id: item.candidateId,
        member_daily_top20_id: input.member_daily_top20_id,
        snapshot_date: input.snapshot_date,
        rank: item.rank,
        recommendation_score: item.overall_score,
        analysis_run_id: isUuid(analysisId) ? analysisId : null,
        re_recommendation_reason: input.re_recommendation?.[item.candidateId]?.reason ?? null,
        re_recommendation_trigger: input.re_recommendation?.[item.candidateId]?.trigger ?? null,
      };
    });
    const { error } = await this.client.from("member_recommendation_occurrences").insert(rows);
    if (error) throw new Error(error.message);
    return { appended: rows.length, skipped_existing };
  }

  override async listMemberScoreSnapshots(input: {
    member_id: string;
    snapshot_date: string;
  }) {
    const { data, error } = await this.client
      .from("radar_candidate_score_snapshots")
      .select("*")
      .eq("member_id", input.member_id);
    if (error) throw new Error(error.message);
    const sameDay = (data ?? []).filter((row) => {
      const snapshot = row.extraction_snapshot as { snapshot_date?: unknown } | null;
      if (snapshot?.snapshot_date === input.snapshot_date) return true;
      const analyzed = String(row.analyzed_at ?? "");
      return analyzed.slice(0, 10) === input.snapshot_date;
    });
    // Score snapshots stay append-only history, so a re-scored candidate has
    // several rows for the day. Ranking takes the newest one per candidate;
    // without this a re-run would rank the same person more than once.
    const latestByCandidate = new Map<string, (typeof sameDay)[number]>();
    for (const row of [...sameDay].sort((a, b) =>
      String(a.analyzed_at ?? a.created_at ?? "").localeCompare(
        String(b.analyzed_at ?? b.created_at ?? ""),
      ),
    )) {
      latestByCandidate.set(String(row.candidate_id_text ?? ""), row);
    }
    const matched = [...latestByCandidate.values()];
    const candidateIds = matched
      .map((row) => String(row.candidate_id_text ?? ""))
      .filter(Boolean);
    const names = new Map<string, string | null>();
    if (candidateIds.length > 0) {
      const { data: candidates, error: candidateError } = await this.client
        .from("candidate_pool")
        .select("id, display_name")
        .in("id", candidateIds);
      if (candidateError) throw new Error(candidateError.message);
      for (const row of candidates ?? []) {
        names.set(String(row.id), row.display_name ? String(row.display_name) : null);
      }
    }
    return matched.map((row) => {
      const snapshot = (row.extraction_snapshot as {
        result?: import("../scoring/types").OverallScoreResult;
        location_level?: unknown;
      } | null) ?? {};
      const candidateId = String(row.candidate_id_text ?? "");
      return {
        candidate_id: candidateId,
        overall_score: Number(row.overall_score),
        result: snapshot.result as never,
        analysis_run_id: String(row.analysis_run_id ?? ""),
        display_name: names.get(candidateId) ?? null,
        location_level: typeof snapshot.location_level === "string" ? snapshot.location_level : null,
      };
    });
  }
}
