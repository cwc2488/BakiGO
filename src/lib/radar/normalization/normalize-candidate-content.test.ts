import { describe, expect, it } from "vitest";
import { FIXTURE_NORMALIZED_CONTENT_ID } from "../extraction/test-fixtures";
import { normalizeCandidateContent } from "./normalize-candidate-content";
import { buildRawSnapshot, REFERENCE_DATE } from "./test-fixtures";
import { isWithinAnalysisWindow, buildAnalysisWindow } from "./query-analysis-window";
import { resolveContentTrace } from "./build-corpus-summary";

describe("normalizeCandidateContent", () => {
  it("marks original candidate text as analyzable", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_1",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_99102",
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(1);
    expect(corpus.last_meaningful_activity_at).toBe("2026-08-08T09:30:00.000Z");
    expect(corpus.data_completeness).toBe("full");
  });

  it("excludes pure repost without commentary", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_2",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_repost",
          payload: {
            published_at: "2026-08-08T09:30:00.000Z",
            content_type: "repost",
            content_relationship: "repost",
            text: null,
            is_authored_by_candidate: true,
          },
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(0);
    expect(corpus.counts.excluded_by_reason.pure_repost).toBe(1);
  });

  it("analyzes quote commentary only while preserving quoted context", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_3",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_quote",
          payload: {
            published_at: "2026-08-08T09:30:00.000Z",
            content_type: "quote_post",
            content_relationship: "quote",
            text: "Original author says something long",
            candidate_commentary_text: "我也開始想認真調整飲食與運動習慣了",
            quoted_content: {
              platform: "threads",
              external_content_id: "quoted_1",
              text_preview: "Original author says something long",
            },
            is_authored_by_candidate: true,
          },
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(1);
    const item = corpus.items[0];
    expect(item.quoted_content).not.toBeNull();
    expect(item.candidate_commentary_text).toContain("認真調整飲食");
    expect(item.normalization_notes).toContain(
      "quoted_content_preserved_for_context_only",
    );
  });

  it("dedups cross-platform identical content to one analyzable item", () => {
    const text = "想尋找額外收入來源，開始認真思考副業方向";
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_4",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_cross",
          payload: {
            published_at: "2026-08-08T09:30:00.000Z",
            content_type: "text_post",
            content_relationship: "original",
            text,
            is_authored_by_candidate: true,
          },
        }),
        buildRawSnapshot({
          external_content_id: "ig_cross",
          platform: "instagram",
          payload: {
            published_at: "2026-08-08T09:31:00.000Z",
            content_type: "text_post",
            content_relationship: "original",
            text,
            is_authored_by_candidate: true,
          },
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(1);
    expect(corpus.items.some((item) => item.exclusion_reason === "cross_platform_duplicate")).toBe(
      true,
    );
  });

  it("excludes emoji-only and generic reactions", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_5",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_emoji",
          payload: {
            published_at: "2026-08-08T09:30:00.000Z",
            content_type: "reply",
            content_relationship: "reply",
            text: "👍👍👍",
            is_authored_by_candidate: true,
          },
        }),
        buildRawSnapshot({
          external_content_id: "th_generic",
          payload: {
            published_at: "2026-08-07T09:30:00.000Z",
            content_type: "reply",
            content_relationship: "reply",
            text: "+1",
            is_authored_by_candidate: true,
          },
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(0);
    expect(corpus.counts.excluded_by_reason.no_expression).toBe(2);
  });

  it("excludes story content in v1", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_6",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_story",
          payload: {
            published_at: "2026-08-08T09:30:00.000Z",
            content_type: "story",
            content_relationship: "original",
            text: "想改善睡眠品質",
            is_authored_by_candidate: true,
          },
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(0);
    expect(corpus.counts.excluded_by_reason.platform_unsupported).toBe(1);
  });

  it("does not mutate exclusion when content ages out of 90-day window", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_7",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_old",
          payload: {
            published_at: "2025-01-01T00:00:00.000Z",
            content_type: "text_post",
            content_relationship: "original",
            text: "以前想減重的一則貼文",
            is_authored_by_candidate: true,
          },
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    const item = corpus.items[0];
    expect(item.exclusion_reason).toBeNull();
    expect(isWithinAnalysisWindow(item.published_at, buildAnalysisWindow(REFERENCE_DATE))).toBe(
      false,
    );
    expect(corpus.analyzable_items).toHaveLength(0);
  });

  it("marks near_duplicate via deterministic similarity threshold", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_8",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_a",
          payload: {
            published_at: "2026-08-08T09:30:00.000Z",
            content_type: "text_post",
            content_relationship: "original",
            text: "我想開始認真調整飲食與運動習慣，希望這次可以真的堅持下去",
            is_authored_by_candidate: true,
          },
        }),
        buildRawSnapshot({
          external_content_id: "th_b",
          payload: {
            published_at: "2026-08-08T10:30:00.000Z",
            content_type: "text_post",
            content_relationship: "original",
            text: "我想開始認真調整飲食跟運動習慣，希望這次可以真的堅持下去",
            is_authored_by_candidate: true,
          },
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.analyzable_items).toHaveLength(1);
    expect(corpus.items.some((item) => item.exclusion_reason === "near_duplicate")).toBe(true);
  });

  it("preserves source trace chain", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_9",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_99102",
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    const trace = resolveContentTrace({
      corpus,
      normalized_content_id: corpus.items[0].normalized_content_id,
    });

    expect(trace).toMatchObject({
      external_content_id: "th_99102",
      platform: "threads",
      raw_snapshot_id: "raw_th_99102",
    });
  });

  it("derives partial data_completeness without treating it as negative activity", () => {
    const corpus = normalizeCandidateContent({
      candidate_id: "cand_8f2a91",
      normalization_run_id: "norm_run_10",
      data_completeness: "partial",
      snapshots: [
        buildRawSnapshot({
          external_content_id: "th_partial",
          fetch_completeness: "partial",
        }),
      ],
      referenceDate: REFERENCE_DATE,
    });

    expect(corpus.data_completeness).toBe("partial");
    expect(corpus.analyzable_items).toHaveLength(1);
    expect(corpus.last_meaningful_activity_at).not.toBeNull();
  });
});

describe("normalization fixture id alignment", () => {
  it("uses stable normalized id prefix for extraction tests", () => {
    expect(FIXTURE_NORMALIZED_CONTENT_ID).toBeTruthy();
  });
});
