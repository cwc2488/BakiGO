import { createHash } from "node:crypto";
import { AI_RADAR_EXTRACTION_SCHEMA_VERSION } from "../extraction/constants";
import { FIT_POLICY_ID } from "../fit-policy/need-types";
import { CONTENT_NORMALIZATION_POLICY_ID } from "../normalization/constants";

export type AnalysisFingerprintInput = {
  analyzable_content: Array<{
    normalized_content_id: string;
    content_hash: string;
  }>;
  profile_semantic_hash: string | null;
  normalization_policy_version?: string;
  extraction_schema_version?: string;
  fit_policy_version?: string;
  prompt_version: string;
  model_id: string;
};

export type CorpusFingerprintInput = {
  analyzable_content: Array<{
    normalized_content_id: string;
    content_hash: string;
  }>;
  profile_semantic_hash: string | null;
  normalization_policy_version?: string;
};

/** Semantic corpus identity — excludes normalization_run_id by design. */
export function computeCorpusFingerprint(input: CorpusFingerprintInput): string {
  const sorted = [...input.analyzable_content].sort((a, b) =>
    a.normalized_content_id.localeCompare(b.normalized_content_id),
  );

  const payload = [
    input.normalization_policy_version ?? CONTENT_NORMALIZATION_POLICY_ID,
    input.profile_semantic_hash ?? "",
    ...sorted.map((item) => `${item.normalized_content_id}:${item.content_hash}`),
  ].join("|");

  return sha256(payload);
}

/**
 * LLM cache fingerprint — based on substantive semantic inputs only.
 * normalization_run_id is audit linkage and MUST NOT invalidate cache.
 */
export function computeAnalysisInputFingerprint(
  input: AnalysisFingerprintInput,
): string {
  const corpus = computeCorpusFingerprint({
    analyzable_content: input.analyzable_content,
    profile_semantic_hash: input.profile_semantic_hash,
    normalization_policy_version: input.normalization_policy_version,
  });

  const payload = [
    corpus,
    input.extraction_schema_version ?? AI_RADAR_EXTRACTION_SCHEMA_VERSION,
    input.fit_policy_version ?? FIT_POLICY_ID,
    input.prompt_version,
    input.model_id,
  ].join("|");

  return sha256(payload);
}

export function fingerprintsMatch(
  corpusFingerprint: string,
  validatedExtractionFingerprint: string,
  analysisInputFingerprint: string,
): boolean {
  return (
    corpusFingerprint.length > 0 &&
    validatedExtractionFingerprint === analysisInputFingerprint
  );
}

export function shouldReanalyzeLlm(input: {
  force_reanalysis: boolean;
  previous_analysis_input_fingerprint: string | null;
  next_analysis_input_fingerprint: string;
  previous_data_completeness: "full" | "partial" | null;
  next_data_completeness: "full" | "partial";
  corpus_materially_changed: boolean;
  profile_semantic_hash_changed: boolean;
}): boolean {
  if (input.force_reanalysis) return true;
  if (!input.previous_analysis_input_fingerprint) return true;
  if (input.previous_analysis_input_fingerprint !== input.next_analysis_input_fingerprint) {
    return true;
  }
  if (input.profile_semantic_hash_changed) return true;
  if (
    input.previous_data_completeness === "partial" &&
    input.next_data_completeness === "full" &&
    input.corpus_materially_changed
  ) {
    return true;
  }
  return false;
}

/** Source freshness for Top20 — date passage alone is insufficient. */
export function isSourceFresh(input: {
  now: Date;
  last_source_check_at: string | null;
  source_freshness_window_days: number;
}): boolean {
  if (!input.last_source_check_at) return false;
  const checkedAt = new Date(input.last_source_check_at);
  const windowMs = input.source_freshness_window_days * 24 * 60 * 60 * 1000;
  return input.now.getTime() - checkedAt.getTime() <= windowMs;
}

export function qualifiesForTop20Analysis(input: {
  source_fresh: boolean;
  corpus_fingerprint: string | null;
  analysis_corpus_fingerprint: string | null;
  validated_extraction_fingerprint: string | null;
  analysis_input_fingerprint: string | null;
  has_validated_extraction: boolean;
}): boolean {
  if (!input.source_fresh || !input.has_validated_extraction) return false;
  if (!input.corpus_fingerprint || !input.analysis_corpus_fingerprint) return false;
  if (input.corpus_fingerprint !== input.analysis_corpus_fingerprint) return false;
  if (!input.validated_extraction_fingerprint || !input.analysis_input_fingerprint) {
    return false;
  }
  return input.validated_extraction_fingerprint === input.analysis_input_fingerprint;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
