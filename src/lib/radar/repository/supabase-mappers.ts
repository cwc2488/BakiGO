import { buildCandidateContentCorpus } from "../normalization/build-corpus-summary";
import { CONTENT_NORMALIZATION_POLICY_ID } from "../normalization/constants";
import type {
  CandidateContentCorpus,
  ContentRelationship,
  ContentType,
  DedupClass,
  ExclusionReason,
  NormalizedContentItem,
  Platform,
} from "../normalization/schema";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import type { AnalysisRunRecord, RefreshStateRecord } from "./types";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function toIso(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (fallback) return fallback;
  return new Date().toISOString();
}

export function toIsoOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function mapRawSnapshotRow(row: Record<string, unknown>) {
  return {
    raw_snapshot_id: String(row.id),
    candidate_id: String(row.candidate_id),
    platform: row.platform as Platform,
    external_content_id: String(row.external_content_id),
    fetched_at: toIso(row.fetched_at),
    adapter_version: String(row.adapter_version),
    fetch_completeness: row.fetch_completeness as "full" | "partial",
    payload: (row.payload as Record<string, unknown>) ?? {},
  };
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  return [];
}

export function mapNormalizedItemRow(
  row: Record<string, unknown>,
): NormalizedContentItem {
  const permalinkRaw = row.permalink ? String(row.permalink) : null;
  return {
    normalized_content_id: String(row.normalized_content_id),
    candidate_id: String(row.candidate_id),
    platform: row.platform as Platform,
    external_content_id: String(row.external_content_id),
    normalization_policy_version: CONTENT_NORMALIZATION_POLICY_ID,
    raw_snapshot_id: String(row.raw_snapshot_id),
    adapter_version: String(row.adapter_version),
    fetched_at: toIso(row.fetched_at),
    published_at: toIso(row.published_at),
    content_type: row.content_type as ContentType,
    content_relationship: row.content_relationship as ContentRelationship,
    text: row.text == null ? null : String(row.text),
    candidate_commentary_text:
      row.candidate_commentary_text == null ? null : String(row.candidate_commentary_text),
    quoted_content: (row.quoted_content as NormalizedContentItem["quoted_content"]) ?? null,
    media: Array.isArray(row.media) ? (row.media as NormalizedContentItem["media"]) : [],
    permalink: permalinkRaw && /^https?:\/\//i.test(permalinkRaw) ? permalinkRaw : null,
    language_hint: null,
    is_candidate_originated: Boolean(row.is_candidate_originated),
    has_meaningful_expression: Boolean(row.has_meaningful_expression),
    is_analyzable: Boolean(row.is_analyzable),
    content_dedup_key: String(row.content_dedup_key),
    duplicate_of: row.duplicate_of == null ? null : String(row.duplicate_of),
    dedup_class: (row.dedup_class as DedupClass | null) ?? null,
    exclusion_reason: (row.exclusion_reason as ExclusionReason | null) ?? null,
    normalization_notes: asStringArray(row.normalization_notes),
    content_hash: String(row.content_hash),
  };
}

export function assembleCorpusFromRows(
  run: Record<string, unknown>,
  itemRows: Record<string, unknown>[],
): CandidateContentCorpus {
  const items = itemRows.map(mapNormalizedItemRow);
  const counts = (run.counts as CandidateContentCorpus["counts"] | null) ?? {
    raw_item_count: items.length,
    normalized_item_count: items.length,
    analyzable_item_count: 0,
    excluded_by_reason: {},
  };
  return buildCandidateContentCorpus({
    candidate_id: String(run.candidate_id),
    normalization_run_id: String(run.normalization_run_id),
    normalized_at: toIso(run.normalized_at),
    data_completeness: run.data_completeness as "full" | "partial",
    items,
    raw_item_count: Number(counts.raw_item_count ?? items.length),
    referenceDate: new Date(toIso(run.window_end_at ?? run.normalized_at)),
  });
}

/** Columns required for partner-card evidence (RADAR-PAGE-PERF-02). */
export const THIN_NORMALIZED_ITEM_SELECT =
  "normalized_content_id, candidate_id, platform, external_content_id, raw_snapshot_id, adapter_version, fetched_at, published_at, content_type, content_relationship, text, candidate_commentary_text, permalink, is_candidate_originated, has_meaningful_expression, is_analyzable, content_dedup_key, duplicate_of, dedup_class, exclusion_reason, content_hash";

/**
 * Partner-feed corpus: preserves stored run counts (for freshness notices)
 * while loading only evidence-relevant item columns — not SELECT *.
 */
export function assembleThinPartnerCorpusFromRows(
  run: Record<string, unknown>,
  itemRows: Record<string, unknown>[],
): CandidateContentCorpus {
  const items = itemRows.map((row) =>
    mapNormalizedItemRow({
      ...row,
      quoted_content: null,
      media: [],
      normalization_notes: [],
    }),
  );
  const stored = (run.counts as CandidateContentCorpus["counts"] | null) ?? null;
  const normalizedAt = toIso(run.normalized_at);
  const windowEnd = toIso(run.window_end_at ?? run.normalized_at);
  const windowStart = toIso(run.window_start_at ?? run.normalized_at);
  const platforms = [...new Set(items.map((item) => item.platform))];

  return {
    candidate_id: String(run.candidate_id),
    normalization_run_id: String(run.normalization_run_id),
    normalization_policy_version: CONTENT_NORMALIZATION_POLICY_ID,
    normalized_at: normalizedAt,
    platforms_included: platforms,
    data_completeness: run.data_completeness as "full" | "partial",
    items,
    analysis_window_days: 90,
    window_start_at: windowStart,
    window_end_at: windowEnd,
    analyzable_items: [],
    last_meaningful_activity_at: null,
    counts: {
      raw_item_count: Number(stored?.raw_item_count ?? items.length),
      normalized_item_count: Number(stored?.normalized_item_count ?? items.length),
      // Prefer stored analyzable count so thin item projection cannot undercount notices.
      analyzable_item_count: Number(stored?.analyzable_item_count ?? 0),
      excluded_by_reason: stored?.excluded_by_reason ?? {},
    },
  };
}

export function mapAnalysisRunRow(row: Record<string, unknown>): AnalysisRunRecord {
  return {
    id: String(row.id),
    candidate_id: String(row.candidate_id),
    status: row.status as AnalysisRunRecord["status"],
    analysis_input_fingerprint: String(row.analysis_input_fingerprint),
    corpus_fingerprint: String(row.corpus_fingerprint),
    profile_semantic_hash: row.profile_semantic_hash ? String(row.profile_semantic_hash) : null,
    normalization_run_id: row.normalization_run_id ? String(row.normalization_run_id) : null,
    extraction_json: (row.extraction_json as AiRadarExtractionV1 | null) ?? null,
    prompt_version: String(row.prompt_version),
    model_id: String(row.model_id),
    error_code: row.error_code ? String(row.error_code) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    created_at: toIso(row.created_at),
  };
}

export function mapRefreshStateRow(row: Record<string, unknown>): RefreshStateRecord {
  return {
    candidate_id: String(row.candidate_id),
    refresh_tier: (row.refresh_tier as RefreshStateRecord["refresh_tier"]) ?? "standard",
    last_source_check_at: toIsoOrNull(row.last_source_check_at),
    last_enrich_succeeded_at: toIsoOrNull(row.last_enrich_succeeded_at),
    last_normalization_succeeded_at: toIsoOrNull(row.last_normalization_succeeded_at),
    source_freshness_valid_until: toIsoOrNull(row.source_freshness_valid_until),
    corpus_fingerprint: row.corpus_fingerprint ? String(row.corpus_fingerprint) : null,
    profile_semantic_hash: row.profile_semantic_hash ? String(row.profile_semantic_hash) : null,
    data_completeness: (row.data_completeness as "full" | "partial" | null) ?? null,
    enrichment_capability_state: row.enrichment_capability_state
      ? String(row.enrichment_capability_state)
      : null,
    current_analysis_run_id: row.current_analysis_run_id ? String(row.current_analysis_run_id) : null,
    validated_extraction_fingerprint: row.validated_extraction_fingerprint
      ? String(row.validated_extraction_fingerprint)
      : null,
    force_reanalysis: Boolean(row.force_reanalysis),
  };
}
