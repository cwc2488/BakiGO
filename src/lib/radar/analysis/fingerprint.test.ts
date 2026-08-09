import { describe, expect, it } from "vitest";
import {
  computeAnalysisInputFingerprint,
  computeCorpusFingerprint,
  isSourceFresh,
  qualifiesForTop20Analysis,
  shouldReanalyzeLlm,
} from "./fingerprint";

const analyzable = [
  { normalized_content_id: "nc_b", content_hash: "hash_b" },
  { normalized_content_id: "nc_a", content_hash: "hash_a" },
];

describe("computeCorpusFingerprint", () => {
  it("is stable regardless of input order", () => {
    const forward = computeCorpusFingerprint({
      analyzable_content: analyzable,
      profile_semantic_hash: "profile_v1",
    });
    const reverse = computeCorpusFingerprint({
      analyzable_content: [...analyzable].reverse(),
      profile_semantic_hash: "profile_v1",
    });
    expect(forward).toBe(reverse);
  });

  it("does not include normalization_run_id", () => {
    const fingerprint = computeAnalysisInputFingerprint({
      analyzable_content: analyzable,
      profile_semantic_hash: "profile_v1",
      prompt_version: "prompt_v1",
      model_id: "model_v1",
    });

    const sameCorpusNewRun = computeAnalysisInputFingerprint({
      analyzable_content: analyzable,
      profile_semantic_hash: "profile_v1",
      prompt_version: "prompt_v1",
      model_id: "model_v1",
    });

    expect(fingerprint).toBe(sameCorpusNewRun);
  });

  it("changes when corpus content hash changes", () => {
    const base = computeAnalysisInputFingerprint({
      analyzable_content: analyzable,
      profile_semantic_hash: "profile_v1",
      prompt_version: "prompt_v1",
      model_id: "model_v1",
    });
    const changed = computeAnalysisInputFingerprint({
      analyzable_content: [
        ...analyzable,
        { normalized_content_id: "nc_c", content_hash: "hash_c" },
      ],
      profile_semantic_hash: "profile_v1",
      prompt_version: "prompt_v1",
      model_id: "model_v1",
    });
    expect(base).not.toBe(changed);
  });
});

describe("shouldReanalyzeLlm", () => {
  const fingerprint = computeAnalysisInputFingerprint({
    analyzable_content: analyzable,
    profile_semantic_hash: "profile_v1",
    prompt_version: "prompt_v1",
    model_id: "model_v1",
  });

  it("does not reanalyze when fingerprint unchanged and no material changes", () => {
    expect(
      shouldReanalyzeLlm({
        force_reanalysis: false,
        previous_analysis_input_fingerprint: fingerprint,
        next_analysis_input_fingerprint: fingerprint,
        previous_data_completeness: "full",
        next_data_completeness: "full",
        corpus_materially_changed: false,
        profile_semantic_hash_changed: false,
      }),
    ).toBe(false);
  });

  it("reanalyzes on force flag", () => {
    expect(
      shouldReanalyzeLlm({
        force_reanalysis: true,
        previous_analysis_input_fingerprint: fingerprint,
        next_analysis_input_fingerprint: fingerprint,
        previous_data_completeness: "full",
        next_data_completeness: "full",
        corpus_materially_changed: false,
        profile_semantic_hash_changed: false,
      }),
    ).toBe(true);
  });

  it("reanalyzes when profile semantic hash changed", () => {
    expect(
      shouldReanalyzeLlm({
        force_reanalysis: false,
        previous_analysis_input_fingerprint: fingerprint,
        next_analysis_input_fingerprint: fingerprint,
        previous_data_completeness: "full",
        next_data_completeness: "full",
        corpus_materially_changed: false,
        profile_semantic_hash_changed: true,
      }),
    ).toBe(true);
  });
});

describe("Top20 freshness gate", () => {
  it("requires source freshness and matching fingerprints", () => {
    const corpus = computeCorpusFingerprint({
      analyzable_content: analyzable,
      profile_semantic_hash: "profile_v1",
    });
    const analysis = computeAnalysisInputFingerprint({
      analyzable_content: analyzable,
      profile_semantic_hash: "profile_v1",
      prompt_version: "prompt_v1",
      model_id: "model_v1",
    });

    expect(
      qualifiesForTop20Analysis({
        source_fresh: true,
        corpus_fingerprint: corpus,
        analysis_corpus_fingerprint: corpus,
        validated_extraction_fingerprint: analysis,
        analysis_input_fingerprint: analysis,
        has_validated_extraction: true,
      }),
    ).toBe(true);

    expect(
      qualifiesForTop20Analysis({
        source_fresh: false,
        corpus_fingerprint: corpus,
        analysis_corpus_fingerprint: corpus,
        validated_extraction_fingerprint: analysis,
        analysis_input_fingerprint: analysis,
        has_validated_extraction: true,
      }),
    ).toBe(false);
  });

  it("treats stale source check independently from analysis age", () => {
    const now = new Date("2026-08-09T12:00:00.000Z");
    expect(
      isSourceFresh({
        now,
        last_source_check_at: "2026-08-08T12:00:00.000Z",
        source_freshness_window_days: 7,
      }),
    ).toBe(true);

    expect(
      isSourceFresh({
        now,
        last_source_check_at: "2026-07-01T12:00:00.000Z",
        source_freshness_window_days: 7,
      }),
    ).toBe(false);
  });
});
