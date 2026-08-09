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

export function normalizeCandidateContent(
  input: NormalizeCandidateContentInput,
): CandidateContentCorpus {
  const parsed = input.snapshots.map(parseRawContentSnapshot);
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
