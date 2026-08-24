import type { EnrichResult, SearchEvidenceHit } from "./types";

/**
 * Keyword-search posts are real candidate-authored public content that Meta
 * already returned. Persisting them keeps their acquisition provenance
 * distinguishable from profile-post enrichment: the adapter_version travels
 * into the normalized item, and the external_content_id stays the Threads post
 * id so normalization dedups a post that profile_posts later returns again.
 */
export const THREADS_SEARCH_ADAPTER_VERSION = "threads_meta_search_v1" as const;

export type RawSnapshotInput = EnrichResult["raw_snapshots"][number];

export function buildSearchEvidenceSnapshot(input: {
  candidate_id: string;
  hit: SearchEvidenceHit;
  fetched_at?: string;
}): RawSnapshotInput | null {
  const { hit } = input;
  if (!hit.external_content_id) return null;
  if (!hit.text || !hit.text.trim()) return null;

  const fetchedAt = input.fetched_at ?? new Date().toISOString();
  const publishedAt = hit.published_at ?? fetchedAt;

  return {
    raw_snapshot_id: `raw_${input.candidate_id}_search_${hit.external_content_id}`,
    external_content_id: hit.external_content_id,
    fetched_at: fetchedAt,
    adapter_version: THREADS_SEARCH_ADAPTER_VERSION,
    fetch_completeness: "partial",
    payload: {
      published_at: publishedAt,
      content_type: hit.is_reply ? "reply" : "text_post",
      content_relationship: hit.is_reply ? "reply" : "original",
      text: hit.text,
      is_authored_by_candidate: true,
      permalink: hit.permalink,
      acquisition_source: "keyword_search",
      acquisition_phrase: hit.matched_phrase,
      acquisition_phrase_key: hit.phrase_key,
      acquisition_need_family: hit.need_family,
      acquisition_phrase_class: hit.phrase_class,
      acquisition_page: hit.acquisition_page,
    },
  };
}

export function buildSearchEvidenceSnapshots(input: {
  candidate_id: string;
  hits: SearchEvidenceHit[];
  fetched_at?: string;
}): RawSnapshotInput[] {
  const byId = new Map<string, RawSnapshotInput>();
  for (const hit of input.hits) {
    const snapshot = buildSearchEvidenceSnapshot({
      candidate_id: input.candidate_id,
      hit,
      fetched_at: input.fetched_at,
    });
    if (!snapshot) continue;
    if (byId.has(snapshot.external_content_id)) continue;
    byId.set(snapshot.external_content_id, snapshot);
  }
  return [...byId.values()];
}
