import { buildCandidateContentCorpus } from "./build-corpus-summary";
import { deduplicateContentItems } from "./deduplicate-content";
import { parseRawContentSnapshot } from "./parse-raw-content";
import type { CandidateContentCorpus, DataCompleteness, RawContentSnapshot } from "./schema";

export type NormalizeCandidateContentInput = {
  candidate_id: string;
  normalization_run_id: string;
  snapshots: RawContentSnapshot[];
  data_completeness?: DataCompleteness;
  normalized_at?: string;
  referenceDate?: Date;
};

/**
 * One platform post can reach us through more than one endpoint (keyword search
 * and later profile posts). Those are repeat fetches of a single content item,
 * so the normalized corpus keeps the most complete fetch and the raw layer keeps
 * every acquisition record.
 */
export function dedupeSnapshotsByContentIdentity(
  snapshots: RawContentSnapshot[],
): RawContentSnapshot[] {
  const canonical = new Map<string, RawContentSnapshot>();

  for (const snapshot of snapshots) {
    const key = `${snapshot.platform}:${snapshot.external_content_id}`;
    const existing = canonical.get(key);
    if (!existing) {
      canonical.set(key, snapshot);
      continue;
    }

    const existingRank = existing.fetch_completeness === "full" ? 1 : 0;
    const nextRank = snapshot.fetch_completeness === "full" ? 1 : 0;
    if (nextRank > existingRank) {
      canonical.set(key, snapshot);
      continue;
    }
    if (nextRank === existingRank && snapshot.fetched_at > existing.fetched_at) {
      canonical.set(key, snapshot);
    }
  }

  return [...canonical.values()];
}

export function normalizeCandidateContent(
  input: NormalizeCandidateContentInput,
): CandidateContentCorpus {
  const snapshots = dedupeSnapshotsByContentIdentity(input.snapshots);
  const parsed = snapshots.map(parseRawContentSnapshot);
  const deduped = deduplicateContentItems(parsed);

  const data_completeness =
    input.data_completeness ??
    (input.snapshots.some((snapshot) => snapshot.fetch_completeness === "partial")
      ? "partial"
      : "full");

  return buildCandidateContentCorpus({
    candidate_id: input.candidate_id,
    normalization_run_id: input.normalization_run_id,
    normalized_at: input.normalized_at ?? new Date().toISOString(),
    data_completeness,
    items: deduped,
    raw_item_count: input.snapshots.length,
    referenceDate: input.referenceDate,
  });
}
