import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_RADAR_MODEL_ID } from "../ai/prompt";
import { capabilityStateFromMetaError } from "../acquisition/capability-states";
import { requireOpenAiRadarLlmProvider } from "../ai/provider";
import { runAnalyzeWorker } from "../jobs/workers/analyze-worker";
import { runNormalizeWorker } from "../jobs/workers/normalize-worker";
import { runRankWorker } from "../jobs/workers/rank-worker";
import { runScoreWorker } from "../jobs/workers/score-worker";
import type { RadarJobRecord } from "../jobs/types";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import { createSourceAdapterRegistry } from "../sources/registry";
import type { RadarRepository } from "../repository/types";

export type LivePipelineCandidateResult = {
  candidate_id: string;
  username: string | null;
  snapshot_ids: string[];
  capability_state: string | null;
  skipped_reason: string | null;
  normalize: { ok: boolean; normalization_run_id: string | null; error: string | null };
  analyze: {
    ok: boolean;
    analysis_run_id: string | null;
    model_id: string | null;
    /** True when the stored extraction was reused instead of calling OpenAI. */
    reused_extraction: boolean;
    error: string | null;
  };
  score: { ok: boolean; overall_score: number | null; error: string | null };
};

function taipeiDate(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

function syntheticJob(input: {
  job_type: RadarJobRecord["job_type"];
  pipeline_run_id: string | null;
  payload: Record<string, unknown>;
}): RadarJobRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    pipeline_run_id: input.pipeline_run_id,
    job_type: input.job_type,
    idempotency_key: `live02:${input.job_type}:${randomUUID()}`,
    status: "running",
    payload: input.payload,
    priority: 0,
    attempt_count: 1,
    max_attempts: 3,
    scheduled_at: now,
    available_at: now,
    started_at: now,
    finished_at: null,
    error_code: null,
    error_message: null,
    trace_id: null,
    created_at: now,
    updated_at: now,
  };
}

async function ensurePipelineRun(
  client: SupabaseClient,
  runDate: string,
): Promise<string> {
  const { data: existing, error: readError } = await client
    .from("radar_pipeline_runs")
    .select("id")
    .eq("run_date", runDate)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.id) return String(existing.id);

  const id = randomUUID();
  const { error } = await client.from("radar_pipeline_runs").insert({
    id,
    run_date: runDate,
    timezone: "Asia/Taipei",
    triggered_by: "preview_radar_live_02",
    status: "running",
    config_version: "radar_daily_pipeline_v1",
  });
  if (error) {
    const { data: raced, error: racedError } = await client
      .from("radar_pipeline_runs")
      .select("id")
      .eq("run_date", runDate)
      .maybeSingle();
    if (racedError) throw new Error(error.message);
    if (raced?.id) return String(raced.id);
    throw new Error(error.message);
  }
  return id;
}

export async function runLiveRadarPipeline(input: {
  client: SupabaseClient;
  repo: RadarRepository;
  candidate_ids?: string[];
  member_id?: string | null;
  now?: Date;
}): Promise<{
  ok: boolean;
  extraction_pass: boolean;
  llm_provider: string;
  structured_output: {
    api: string;
    response_format: string;
    strict: boolean;
    name: string;
    model: string;
  };
  pipeline_run_id: string;
  member_id: string;
  snapshot_date: string;
  candidates: LivePipelineCandidateResult[];
  rank: { ok: boolean; item_count: number; skipped_freshness_or_analysis: number; error: string | null };
  labeled_below_threshold: string[];
}> {
  const now = input.now ?? new Date();
  const snapshot_date = taipeiDate(now);
  const llm = requireOpenAiRadarLlmProvider();
  const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
  const ctx = {
    repo: input.repo,
    queue,
    sources: createSourceAdapterRegistry({
      record: (entry) => input.repo.recordSourceFetchAudit(entry),
    }),
    llm,
    now,
    scoreMemberIds: [] as string[],
  };

  const members = await input.repo.listActiveMembers();
  let member_id = input.member_id ?? members[0]?.member_id;
  if (!member_id) {
    throw new Error("No active member available for live score/rank.");
  }

  const requestedIds = input.candidate_ids?.filter(Boolean) ?? [];
  const discoveredIds = new Set<string>(requestedIds);
  if (requestedIds.length === 0) {
    const { data: snapshotIds, error: snapshotIdError } = await input.client
      .from("candidate_content_snapshots_raw")
      .select("candidate_id");
    if (snapshotIdError) throw new Error(snapshotIdError.message);
    for (const row of snapshotIds ?? []) discoveredIds.add(String(row.candidate_id));

    const { data: failedLookups, error: failedError } = await input.client
      .from("source_fetch_audit_log")
      .select("candidate_id")
      .eq("endpoint", "profile_lookup")
      .eq("status", "failed")
      .order("fetched_at", { ascending: false })
      .limit(20);
    if (failedError) throw new Error(failedError.message);
    for (const row of failedLookups ?? []) {
      if (row.candidate_id) discoveredIds.add(String(row.candidate_id));
    }
  }
  const poolIds = [...discoveredIds];
  const { data: poolRows, error: poolError } =
    poolIds.length > 0
      ? await input.client
          .from("candidate_pool")
          .select("id, normalized_username, acquisition_source, lifecycle_state")
          .in("id", poolIds)
      : { data: [], error: null };
  if (poolError) throw new Error(poolError.message);
  const pool = poolRows ?? [];

  const { data: snapshotRows, error: snapshotError } = await input.client
    .from("candidate_content_snapshots_raw")
    .select("id, candidate_id")
    .in("candidate_id", poolIds.length > 0 ? poolIds : ["__none__"]);
  if (snapshotError) throw new Error(snapshotError.message);
  const snapshotsByCandidate = new Map<string, string[]>();
  for (const row of snapshotRows ?? []) {
    const candidateId = String(row.candidate_id);
    const list = snapshotsByCandidate.get(candidateId) ?? [];
    list.push(String(row.id));
    snapshotsByCandidate.set(candidateId, list);
  }

  const { data: audits, error: auditError } = await input.client
    .from("source_fetch_audit_log")
    .select("candidate_id, error_message, error_code, endpoint, status")
    .in("candidate_id", poolIds.length > 0 ? poolIds : ["__none__"])
    .eq("endpoint", "profile_lookup")
    .eq("status", "failed");
  if (auditError) throw new Error(auditError.message);

  const labeled_below_threshold: string[] = [];
  for (const row of audits ?? []) {
    const candidateId = String(row.candidate_id ?? "");
    if (!candidateId || snapshotsByCandidate.has(candidateId)) continue;
    const state = capabilityStateFromMetaError(String(row.error_message ?? ""));
    if (state !== "below_threads_profile_threshold") continue;
    await input.repo.updateRefreshStateAfterEnrich({
      candidate_id: candidateId,
      succeeded: false,
      enrichment_capability_state: state,
      now,
    });
    labeled_below_threshold.push(candidateId);
  }

  if (!input.member_id) {
    const { data: discoveries } = await input.client
      .from("candidate_discoveries")
      .select("member_id")
      .in("candidate_id", poolIds.length > 0 ? poolIds : ["__none__"])
      .limit(1);
    if (discoveries?.[0]?.member_id) {
      member_id = String(discoveries[0].member_id);
    }
  }
  ctx.scoreMemberIds = [member_id];

  const pipeline_run_id = await ensurePipelineRun(input.client, snapshot_date);
  const results: LivePipelineCandidateResult[] = [];

  for (const row of pool) {
    const candidate_id = String(row.id);
    const snapshot_ids = snapshotsByCandidate.get(candidate_id) ?? [];
    const result: LivePipelineCandidateResult = {
      candidate_id,
      username: row.normalized_username ? String(row.normalized_username) : null,
      snapshot_ids,
      capability_state: labeled_below_threshold.includes(candidate_id)
        ? "below_threads_profile_threshold"
        : null,
      skipped_reason: null,
      normalize: { ok: false, normalization_run_id: null, error: null },
      analyze: {
        ok: false,
        analysis_run_id: null,
        model_id: null,
        reused_extraction: false,
        error: null,
      },
      score: { ok: false, overall_score: null, error: null },
    };

    if (snapshot_ids.length === 0) {
      result.skipped_reason = labeled_below_threshold.includes(candidate_id)
        ? "below_threads_profile_threshold"
        : "no_raw_snapshots";
      results.push(result);
      continue;
    }

    const existingCorpus = await input.repo.getLatestNormalizationRun(candidate_id);
    if (existingCorpus) {
      result.normalize.ok = true;
      result.normalize.normalization_run_id = existingCorpus.normalization_run_id;
      results.push(result);
      continue;
    }

    const normalizeJob = syntheticJob({
      job_type: "normalize",
      pipeline_run_id,
      payload: {
        run_date: snapshot_date,
        candidate_id,
        artifact_refs: { raw_snapshot_ids: snapshot_ids },
      },
    });
    const normalized = await runNormalizeWorker(ctx, normalizeJob);
    if (normalized.status !== "succeeded") {
      result.normalize.error = normalized.error_message ?? "normalize failed";
      results.push(result);
      continue;
    }
    result.normalize.ok = true;
    result.normalize.normalization_run_id = String(
      normalized.metrics?.normalization_run_id ?? "",
    );
    results.push(result);
  }

  const toAnalyze = results.filter((row) => row.normalize.ok && row.normalize.normalization_run_id);
  for (const result of toAnalyze) {
    const analyzeJob = syntheticJob({
      job_type: "analyze",
      pipeline_run_id,
      payload: {
        run_date: snapshot_date,
        candidate_id: result.candidate_id,
        artifact_refs: { normalization_run_id: result.normalize.normalization_run_id },
      },
    });
    const analyzed = await runAnalyzeWorker(ctx, analyzeJob);
    if (analyzed.status !== "succeeded") {
      result.analyze.error = analyzed.error_message ?? "analyze failed";
      continue;
    }
    result.analyze.ok = true;
    result.analyze.analysis_run_id = String(analyzed.metrics?.analysis_run_id ?? "");
    result.analyze.reused_extraction = analyzed.metrics?.cache_hit === true;
    const analysis = await input.repo.getAnalysisRun(result.analyze.analysis_run_id);
    result.analyze.model_id = analysis?.model_id ?? null;
    if (analysis?.model_id === "fixture_llm_v1") {
      result.analyze.ok = false;
      result.analyze.error = "FixtureAiRadarLlmProvider used on live path";
    }
  }

  const toScore = results.filter((row) => row.analyze.ok && row.analyze.analysis_run_id);
  if (toScore.length > 0) {
    await input.repo.initMemberScoreProgress({
      pipeline_run_id,
      member_id,
      expected_score_jobs: toScore.length,
    });
  }
  for (const result of toScore) {
    const scoreJob = syntheticJob({
      job_type: "score",
      pipeline_run_id,
      payload: {
        run_date: snapshot_date,
        member_id,
        candidate_id: result.candidate_id,
        artifact_refs: { analysis_run_id: result.analyze.analysis_run_id },
      },
    });
    const scored = await runScoreWorker(ctx, scoreJob);
    if (scored.status !== "succeeded") {
      result.score.error = scored.error_message ?? "score failed";
      continue;
    }
    result.score.ok = true;
    result.score.overall_score =
      typeof scored.metrics?.overall_score === "number" ? scored.metrics.overall_score : null;
  }

  const rank = {
    ok: false,
    item_count: 0,
    skipped_freshness_or_analysis: 0,
    error: null as string | null,
  };
  if (results.some((row) => row.score.ok)) {
    const rankJob = syntheticJob({
      job_type: "rank",
      pipeline_run_id,
      payload: {
        run_date: snapshot_date,
        member_id,
        artifact_refs: {},
      },
    });
    const ranked = await runRankWorker(ctx, rankJob);
    if (ranked.status !== "succeeded") {
      rank.error = ranked.error_message ?? "rank failed";
    } else {
      rank.ok = true;
      rank.item_count = Number(ranked.metrics?.item_count ?? 0);
      rank.skipped_freshness_or_analysis = Number(
        ranked.metrics?.skipped_freshness_or_analysis ?? 0,
      );
    }
  } else {
    rank.error = "no scored candidates";
  }

  return {
    ok:
      rank.ok &&
      rank.item_count > 0 &&
      results.some(
        (row) => row.normalize.ok && row.analyze.ok && row.score.ok && row.analyze.model_id !== "fixture_llm_v1",
      ),
    extraction_pass: results.some(
      (row) => row.analyze.ok && row.analyze.model_id && row.analyze.model_id !== "fixture_llm_v1",
    ),
    llm_provider: "OpenAiRadarLlmProvider",
    structured_output: {
      api: "chat.completions",
      response_format: "json_schema",
      strict: true,
      name: "ai_radar_extraction_v1",
      model: AI_RADAR_MODEL_ID,
    },
    pipeline_run_id,
    member_id,
    snapshot_date,
    candidates: results,
    rank,
    labeled_below_threshold,
  };
}
