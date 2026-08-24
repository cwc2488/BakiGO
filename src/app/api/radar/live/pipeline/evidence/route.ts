import { NextResponse } from "next/server";
import { previewRadarLiveGuard } from "@/lib/radar/live/preview-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_TEXT_MARKER = "最近開始認真思考";

export async function GET(request: Request) {
  const gate = previewRadarLiveGuard(request);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase service role is not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id")?.trim() ?? "";
  const snapshotDate = url.searchParams.get("snapshot_date")?.trim() ?? "";
  const candidateIds =
    url.searchParams.get("candidate_ids")?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  if (!memberId || !snapshotDate) {
    return NextResponse.json(
      { ok: false, error: "member_id and snapshot_date are required" },
      { status: 400 },
    );
  }

  const client = createSupabaseServiceClient();

  // Selected as a list, not `maybeSingle()`, so the answer to "is there exactly
  // one snapshot for this member-day?" is observable rather than an error.
  const { data: top20Rows, error: top20Error } = await client
    .from("member_daily_top20")
    .select("id, member_id, pipeline_run_id, snapshot_date, generated_at, item_count, items")
    .eq("member_id", memberId)
    .eq("snapshot_date", snapshotDate)
    .order("generated_at", { ascending: false });
  if (top20Error) {
    return NextResponse.json({ ok: false, error: top20Error.message, table: "member_daily_top20" }, { status: 500 });
  }
  const top20 = (top20Rows ?? [])[0] ?? null;

  const { data: occurrenceRows, error: occurrenceError } = await client
    .from("member_recommendation_occurrences")
    .select("id, candidate_id, member_daily_top20_id, rank, recommended_at, re_recommendation_reason")
    .eq("member_id", memberId)
    .eq("snapshot_date", snapshotDate)
    .order("recommended_at", { ascending: true });
  if (occurrenceError) {
    return NextResponse.json(
      { ok: false, error: occurrenceError.message, table: "member_recommendation_occurrences" },
      { status: 500 },
    );
  }
  const occurrencesByCandidate = new Map<string, typeof occurrenceRows>();
  for (const row of occurrenceRows ?? []) {
    const key = String(row.candidate_id);
    occurrencesByCandidate.set(key, [...(occurrencesByCandidate.get(key) ?? []), row]);
  }
  const occurrences = {
    total: (occurrenceRows ?? []).length,
    // A second row without a re-recommendation reason is a retry duplicate.
    retry_duplicates: [...occurrencesByCandidate.values()].reduce(
      (sum, rows) => sum + rows.filter((row, index) => index > 0 && !row.re_recommendation_reason).length,
      0,
    ),
    by_candidate: [...occurrencesByCandidate.entries()].map(([candidate_id, rows]) => ({
      candidate_id,
      count: rows.length,
      snapshot_ids: [...new Set(rows.map((row) => String(row.member_daily_top20_id ?? "null")))],
    })),
  };

  const top20CandidateIds = Array.isArray(top20?.items)
    ? top20.items
        .map((item) => String((item as { candidateId?: unknown }).candidateId ?? ""))
        .filter(Boolean)
    : [];
  const ids = [...new Set([...candidateIds, ...top20CandidateIds])];
  if (ids.length === 0) {
    return NextResponse.json({
      ok: false,
      source: "supabase_direct",
      error: "no candidate ids in Top20 or query",
    });
  }

  const { data: candidates, error: candidateError } = await client
    .from("candidate_pool")
    .select("id, display_name, primary_platform, normalized_username, acquisition_source")
    .in("id", ids);
  if (candidateError) {
    return NextResponse.json({ ok: false, error: candidateError.message, table: "candidate_pool" }, { status: 500 });
  }

  const { data: scores, error: scoreError } = await client
    .from("radar_candidate_score_snapshots")
    .select("id, candidate_id_text, analysis_run_id, overall_score, extraction_snapshot, analyzed_at")
    .eq("member_id", memberId)
    .in("candidate_id_text", ids);
  if (scoreError) {
    return NextResponse.json(
      { ok: false, error: scoreError.message, table: "radar_candidate_score_snapshots" },
      { status: 500 },
    );
  }

  const { data: analyses, error: analysisError } = await client
    .from("candidate_analysis_runs")
    .select(
      "id, candidate_id, status, model_id, prompt_version, normalization_run_id, extraction_json, corpus_fingerprint, error_code, error_message",
    )
    .in("candidate_id", ids);
  if (analysisError) {
    return NextResponse.json(
      { ok: false, error: analysisError.message, table: "candidate_analysis_runs" },
      { status: 500 },
    );
  }

  const analysisIdsFromScores = [...new Set((scores ?? []).map((row) => String(row.analysis_run_id ?? "")).filter(Boolean))];
  const missingAnalysisIds = analysisIdsFromScores.filter(
    (id) => !(analyses ?? []).some((row) => String(row.id) === id),
  );
  const { data: extraAnalyses, error: extraAnalysisError } =
    missingAnalysisIds.length > 0
      ? await client
          .from("candidate_analysis_runs")
          .select(
            "id, candidate_id, status, model_id, prompt_version, normalization_run_id, extraction_json, corpus_fingerprint, error_code, error_message",
          )
          .in("id", missingAnalysisIds)
      : { data: [], error: null };
  if (extraAnalysisError) {
    return NextResponse.json(
      { ok: false, error: extraAnalysisError.message, table: "candidate_analysis_runs" },
      { status: 500 },
    );
  }
  const allAnalyses = [...(analyses ?? []), ...(extraAnalyses ?? [])];

  const { data: latestNorms, error: latestNormError } = await client
    .from("candidate_normalization_runs")
    .select(
      "normalization_run_id, candidate_id, analysis_window_days, analyzable_item_count, window_start_at, window_end_at, counts",
    )
    .in("candidate_id", ids);
  if (latestNormError) {
    return NextResponse.json(
      { ok: false, error: latestNormError.message, table: "candidate_normalization_runs" },
      { status: 500 },
    );
  }

  const normalizationIds = [
    ...new Set([
      ...(allAnalyses ?? []).map((row) => String(row.normalization_run_id ?? "")).filter(Boolean),
      ...(latestNorms ?? []).map((row) => String(row.normalization_run_id ?? "")).filter(Boolean),
    ]),
  ];
  const { data: norms, error: normError } =
    normalizationIds.length > 0
      ? await client
          .from("candidate_normalization_runs")
          .select(
            "normalization_run_id, candidate_id, analysis_window_days, analyzable_item_count, window_start_at, window_end_at, counts",
          )
          .in("normalization_run_id", normalizationIds)
      : { data: [], error: null };
  if (normError) {
    return NextResponse.json(
      { ok: false, error: normError.message, table: "candidate_normalization_runs" },
      { status: 500 },
    );
  }

  const { data: normalizedItems, error: itemError } =
    normalizationIds.length > 0
      ? await client
          .from("candidate_content_normalized")
          .select(
            "normalized_content_id, candidate_id, normalization_run_id, raw_snapshot_id, permalink, is_candidate_originated, has_meaningful_expression, is_analyzable, duplicate_of, exclusion_reason, published_at",
          )
          .in("normalization_run_id", normalizationIds)
      : { data: [], error: null };
  if (itemError) {
    return NextResponse.json(
      { ok: false, error: itemError.message, table: "candidate_content_normalized" },
      { status: 500 },
    );
  }

  const rawIds = [
    ...new Set((normalizedItems ?? []).map((row) => String(row.raw_snapshot_id ?? "")).filter(Boolean)),
  ];
  const { data: raws, error: rawError } =
    rawIds.length > 0
      ? await client
          .from("candidate_content_snapshots_raw")
          .select("id, candidate_id, platform, external_content_id, payload, fetched_at")
          .in("id", rawIds)
      : { data: [], error: null };
  if (rawError) {
    return NextResponse.json(
      { ok: false, error: rawError.message, table: "candidate_content_snapshots_raw" },
      { status: 500 },
    );
  }

  const { data: refreshRows, error: refreshError } = await client
    .from("candidate_refresh_state")
    .select(
      "candidate_id, last_source_check_at, enrichment_capability_state, corpus_fingerprint, validated_extraction_fingerprint",
    )
    .in("candidate_id", ids);
  if (refreshError) {
    return NextResponse.json(
      { ok: false, error: refreshError.message, table: "candidate_refresh_state" },
      { status: 500 },
    );
  }

  const fixtureHits = [
    ...(candidates ?? []).filter((row) => String(row.normalized_username ?? "").startsWith("user_")),
    ...(raws ?? []).filter((row) => {
      const payload = row.payload as { text?: unknown } | null;
      return typeof payload?.text === "string" && payload.text.includes(FIXTURE_TEXT_MARKER);
    }),
    ...(allAnalyses ?? []).filter((row) => String(row.model_id ?? "") === "fixture_llm_v1"),
  ];

  const lineage = top20CandidateIds.map((candidateId) => {
    const candidate = (candidates ?? []).find((row) => String(row.id) === candidateId) ?? null;
    const score = (scores ?? []).find((row) => String(row.candidate_id_text) === candidateId) ?? null;
    const analysis =
      (allAnalyses ?? []).find((row) => String(row.id) === String(score?.analysis_run_id ?? "")) ??
      (allAnalyses ?? []).find(
        (row) => String(row.candidate_id) === candidateId && row.status === "succeeded" && row.extraction_json,
      ) ??
      null;
    const norm =
      (norms ?? []).find((row) => String(row.normalization_run_id) === String(analysis?.normalization_run_id ?? "")) ??
      null;
    const items = (normalizedItems ?? []).filter(
      (row) => String(row.normalization_run_id) === String(norm?.normalization_run_id ?? ""),
    );
    const firstItem = items.find((row) => row.is_analyzable && !row.duplicate_of) ?? items[0] ?? null;
    const raw = firstItem
      ? (raws ?? []).find((row) => String(row.id) === String(firstItem.raw_snapshot_id)) ?? null
      : null;
    const payload = (raw?.payload as { permalink?: unknown; timestamp?: unknown } | null) ?? null;
    return {
      top20_candidate_id: candidateId,
      username: candidate?.normalized_username ?? null,
      overall_score: score?.overall_score ?? null,
      analysis_run_id: analysis?.id ?? null,
      model_id: analysis?.model_id ?? null,
      normalization_run_id: norm?.normalization_run_id ?? null,
      analysis_window_days: norm?.analysis_window_days ?? null,
      analyzable_item_count: norm?.analyzable_item_count ?? null,
      normalized_content_id: firstItem?.normalized_content_id ?? null,
      raw_snapshot_id: raw?.id ?? null,
      permalink: payload?.permalink ?? firstItem?.permalink ?? null,
    };
  });

  const completeLineage = lineage.filter(
    (row) =>
      row.username &&
      row.overall_score != null &&
      row.analysis_run_id &&
      row.model_id &&
      row.model_id !== "fixture_llm_v1" &&
      row.normalization_run_id &&
      row.raw_snapshot_id &&
      row.permalink,
  );

  const liveExtractions = (allAnalyses ?? []).filter(
    (row) =>
      row.status === "succeeded" &&
      Boolean(row.extraction_json) &&
      row.model_id &&
      String(row.model_id) !== "fixture_llm_v1",
  );

  return NextResponse.json({
    ok: Boolean(top20) && completeLineage.length > 0 && fixtureHits.length === 0,
    extraction_pass: liveExtractions.length > 0 && fixtureHits.length === 0,
    source: "supabase_direct",
    member_id: memberId,
    snapshot_date: snapshotDate,
    top20: top20
      ? {
          id: top20.id,
          item_count: top20.item_count,
          pipeline_run_id: top20.pipeline_run_id,
          generated_at: top20.generated_at,
          candidate_ids: top20CandidateIds,
        }
      : null,
    top20_row_count: (top20Rows ?? []).length,
    occurrences,
    scores: scores ?? [],
    analyses: (allAnalyses ?? []).map((row) => ({
      id: row.id,
      candidate_id: row.candidate_id,
      status: row.status,
      model_id: row.model_id,
      prompt_version: row.prompt_version,
      normalization_run_id: row.normalization_run_id,
      has_extraction_json: Boolean(row.extraction_json),
      error_code: row.error_code ?? null,
    })),
    normalizations: norms ?? [],
    normalized_item_count: (normalizedItems ?? []).length,
    raw_snapshot_count: (raws ?? []).length,
    refresh: refreshRows ?? [],
    lineage,
    complete_lineage_count: completeLineage.length,
    fixture_contamination: fixtureHits.length,
  });
}
