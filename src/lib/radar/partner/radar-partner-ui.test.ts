import { describe, expect, it } from "vitest";
import {
  FIXTURE_NORMALIZED_CONTENT_ID,
  buildValidExtractionFixture,
} from "../extraction/test-fixtures";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../normalization/test-fixtures";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import type { RankedCandidate } from "../scoring/types";
import { applyRadarPartnerAction } from "./apply-radar-partner-action";
import { loadRadarPartnerFeed } from "./load-radar-partner-feed";
import {
  buildRadarPartnerCard,
  formatProtectionDate,
  radarErrorMessage,
} from "./radar-partner-presentation";

function ranked(candidateId: string, score: number): RankedCandidate {
  return {
    candidateId,
    overall_score: score,
    display_overall_score: score,
    rank: 1,
    result: {
      scoring_version: "v1",
      overall_score: score,
      components: {
        change_window_score: 20,
        change_intent_score: 8,
        behavioral_change_score: 6,
        solution_gap_score: 6,
        needs_fit_score: 15,
        contactability_score: 10,
        natural_entry_score: 6,
        interaction_openness_score: 4,
        core_traits_score: 3,
        activity_score: 3,
        location_score: 2.5,
      },
      core_traits: {
        trait_scores: [],
        core_traits_score: 3,
        profile_observability: {
          profile_observability_level: "medium",
          analyzable_item_count: 1,
          excluded_repost_count: 0,
          excluded_duplicate_count: 0,
          excluded_empty_share_count: 0,
          excluded_no_expression_count: 0,
          excluded_unattributable_count: 0,
        },
        trait_observability: [],
      },
      needs: [],
    },
  };
}

describe("Radar Partner presentation", () => {
  it("uses extraction evidence for why-recommend, not score thresholds", () => {
    const extraction = buildValidExtractionFixture();
    const corpus = normalizeCandidateContent({
      candidate_id: extraction.candidate_id,
      normalization_run_id: "norm_ui",
      snapshots: [
        buildRawSnapshot({
          candidate_id: extraction.candidate_id,
          external_content_id: "th_body",
          payload: {
            published_at: "2026-08-08T09:30:00.000Z",
            content_type: "text_post",
            content_relationship: "original",
            text: "想改善體態，最近對身型很不滿意。",
            is_authored_by_candidate: true,
            permalink: "https://www.threads.net/@kuo.e2323/post/abc",
          },
        }),
      ],
    });
    const item = corpus.items.find((row) => row.is_analyzable);
    const card = buildRadarPartnerCard({
      ranked: ranked("cand_8f2a91", 71),
      candidate: {
        id: "cand_8f2a91",
        display_name: null,
        primary_platform: "threads",
        lifecycle_state: "active",
        profile_semantic_hash: null,
        normalized_username: "kuo.e2323",
      },
      extraction: item
        ? { ...extraction, change_window: extraction.change_window, needs: extraction.needs }
        : extraction,
      corpus: {
        ...corpus,
        items: corpus.items.map((row) =>
          row.is_analyzable
            ? { ...row, normalized_content_id: extraction.change_window.change_intent.availability === "available"
                ? extraction.change_window.change_intent.source_refs[0].content_id
                : row.normalized_content_id }
            : row,
        ),
      },
      refresh: {
        candidate_id: "cand_8f2a91",
        refresh_tier: "standard",
        last_source_check_at: "2026-08-21T08:00:00.000Z",
        last_enrich_succeeded_at: "2026-08-21T08:00:00.000Z",
        last_normalization_succeeded_at: "2026-08-21T08:00:00.000Z",
        source_freshness_valid_until: null,
        corpus_fingerprint: "fp",
        profile_semantic_hash: null,
        data_completeness: "full",
        enrichment_capability_state: "available",
        current_analysis_run_id: null,
        validated_extraction_fingerprint: "fp",
        force_reanalysis: false,
      },
      now: new Date("2026-08-21T10:00:00.000Z"),
      source_freshness_window_days: 7,
    });

    expect(card.why.join(" ")).toContain("改變意圖");
    expect(card.why.join(" ")).not.toContain("change_window_elevated");
    expect(card.primary_need).toBe("體態改變");
    expect(card.change_signal).toBe("改變意圖很強");
    expect(card.evidence[0]?.url).toContain("threads.net");
    expect(card.score).toBe(71);
  });

  it("shows 資訊不足 when extraction has no evidenced reasoning", () => {
    const extraction = buildValidExtractionFixture({
      change_window: {
        change_intent: { availability: "unknown", reasoning: "公開內容看不出改變意圖" },
        behavioral_change: { availability: "unknown", reasoning: "沒有可歸因的行動" },
        solution_gap: { availability: "unknown", reasoning: "看不出解法缺口" },
      },
      needs: { availability: "unknown", reasoning: "沒有足夠需求證據" },
    });
    const card = buildRadarPartnerCard({
      ranked: ranked("cand_empty", 5),
      candidate: {
        id: "cand_empty",
        display_name: null,
        primary_platform: "threads",
        lifecycle_state: "active",
        profile_semantic_hash: null,
        normalized_username: "mingisonggf",
      },
      extraction,
      corpus: null,
      refresh: {
        candidate_id: "cand_empty",
        refresh_tier: "standard",
        last_source_check_at: "2026-08-21T08:00:00.000Z",
        last_enrich_succeeded_at: null,
        last_normalization_succeeded_at: "2026-08-21T08:00:00.000Z",
        source_freshness_valid_until: null,
        corpus_fingerprint: "fp",
        profile_semantic_hash: null,
        data_completeness: "partial",
        enrichment_capability_state: "below_threads_profile_threshold",
        current_analysis_run_id: null,
        validated_extraction_fingerprint: "fp",
        force_reanalysis: false,
      },
      now: new Date("2026-08-21T10:00:00.000Z"),
      source_freshness_window_days: 7,
    });
    expect(card.why).toEqual([]);
    expect(card.why_insufficient).toBe(true);
    expect(card.notices).toContain("insufficient_evidence");
    expect(card.notices).toContain("below_profile_threshold");
  });
});

describe("Radar Partner card copy", () => {
  function cardFor(extraction: ReturnType<typeof buildValidExtractionFixture>) {
    return buildRadarPartnerCard({
      ranked: ranked("cand_copy", 60),
      candidate: {
        id: "cand_copy",
        display_name: null,
        primary_platform: "threads",
        lifecycle_state: "active",
        profile_semantic_hash: null,
        normalized_username: "copy_case",
      },
      extraction,
      corpus: null,
      refresh: null,
      now: new Date("2026-08-21T10:00:00.000Z"),
      source_freshness_window_days: 7,
    });
  }

  it("labels the primary need in zh-TW even when the model returns an English label", () => {
    const card = cardFor(
      buildValidExtractionFixture({
        needs: {
          availability: "available",
          items: [
            {
              need_id: "muscle",
              need_type: "muscle_fitness_performance",
              label: "muscle gain and body composition improvement",
              strength: "strong",
              relevance: "high_fit",
              source_refs: [{ platform: "threads", content_id: FIXTURE_NORMALIZED_CONTENT_ID }],
              reasoning: "想增肌。",
            },
          ],
          reasoning: "偵測到一項主要需求。",
        },
      }),
    );

    expect(card.primary_need).toBe("增肌／體能提升");
  });

  it("never cuts a why line in the middle of a word", () => {
    const reasoning = "近期多次提到已持續飲食控制與運動但是體重仍然停滯並且表達明顯挫折感".repeat(3);
    const card = cardFor(
      buildValidExtractionFixture({
        change_window: {
          change_intent: {
            availability: "available",
            level: "clear",
            source_refs: [{ platform: "threads", content_id: FIXTURE_NORMALIZED_CONTENT_ID }],
            reasoning,
          },
          behavioral_change: { availability: "unknown", reasoning: "沒有可歸因的行動" },
          solution_gap: { availability: "unknown", reasoning: "看不出解法缺口" },
        },
      }),
    );

    const line = card.why[0];
    expect(line.endsWith("…")).toBe(true);
    const kept = line.slice(0, -1);
    expect(reasoning.startsWith(kept)).toBe(true);
  });

  it("labels a small solution gap instead of dropping the change signal", () => {
    const card = cardFor(
      buildValidExtractionFixture({
        change_window: {
          change_intent: { availability: "unknown", reasoning: "看不出改變意圖" },
          behavioral_change: { availability: "unknown", reasoning: "沒有可歸因的行動" },
          solution_gap: {
            availability: "available",
            level: "small",
            source_refs: [{ platform: "threads", content_id: FIXTURE_NORMALIZED_CONTENT_ID }],
            reasoning: "現有做法只差一點。",
          },
        },
      }),
    );

    expect(card.change_signal).toBe("解法還差一點");
  });

  it("keeps a whole sentence when one fits the line budget", () => {
    const card = cardFor(
      buildValidExtractionFixture({
        change_window: {
          change_intent: {
            availability: "available",
            level: "clear",
            source_refs: [{ platform: "threads", content_id: FIXTURE_NORMALIZED_CONTENT_ID }],
            reasoning:
              "近期多次表達本人體重上升且飲控無效，屬於尚未解決的減脂需求。這第二句要把整段開發理由拉得遠遠超過一行手機預算所以後面這些字只是在把長度堆上去不應該被當成同一句留下。",
          },
          behavioral_change: { availability: "unknown", reasoning: "沒有可歸因的行動" },
          solution_gap: { availability: "unknown", reasoning: "看不出解法缺口" },
        },
      }),
    );

    expect(card.why[0]).toBe("近期多次表達本人體重上升且飲控無效，屬於尚未解決的減脂需求。");
  });
});

describe("Radar Partner error copy", () => {
  it("keeps partner-safe business messages", () => {
    expect(
      radarErrorMessage({ status: 403, error: "這位不在你今天的推薦名單", fallback: "請稍後再試。" }),
    ).toBe("這位不在你今天的推薦名單");
  });

  it("never shows a technical server message to the partner", () => {
    expect(
      radarErrorMessage({
        status: 500,
        error: 'duplicate key value violates unique constraint "member_daily_top20_member_id_snapshot_date_key"',
        fallback: "現在讀不到今日推薦，請稍後再試。",
      }),
    ).toBe("現在讀不到今日推薦，請稍後再試。");
    expect(
      radarErrorMessage({ status: 503, error: "Supabase is not configured", fallback: "請稍後再試。" }),
    ).toBe("請稍後再試。");
  });

  it("explains an expired session in zh-TW", () => {
    expect(radarErrorMessage({ status: 401, error: "Unauthorized", fallback: "請稍後再試。" })).toBe(
      "登入已過期，請重新登入後再試。",
    );
  });
});

describe("Radar Partner feed ownership and actions", () => {
  const memberA = "member-a";
  const memberB = "member-b";
  const now = new Date("2026-08-21T10:00:00.000Z");

  async function seedTop20(repo: InMemoryRadarRepository, memberId: string) {
    await repo.upsertCandidate({
      id: "cand_threads_kuo.e2323",
      normalized_username: "kuo.e2323",
      primary_platform: "threads",
    });
    await repo.upsertMemberDailyTop20({
      member_id: memberId,
      pipeline_run_id: "run-1",
      snapshot_date: "2026-08-21",
      generated_at: now,
      items: [ranked("cand_threads_kuo.e2323", 71)],
    });
  }

  it("does not show another member's Top20", async () => {
    const repo = new InMemoryRadarRepository();
    await seedTop20(repo, memberA);
    const feed = await loadRadarPartnerFeed({ repo, member_id: memberB, now });
    expect(feed.recommendation_count).toBe(0);
    expect(feed.empty_reason).toBe("no_snapshot");
    expect(feed.items).toEqual([]);
  });

  it("rejects acting on a candidate that is not on this member's snapshot", async () => {
    const repo = new InMemoryRadarRepository();
    await seedTop20(repo, memberA);
    const result = await applyRadarPartnerAction({
      repo,
      member_id: memberB,
      candidate_id: "cand_threads_kuo.e2323",
      action: "start",
      now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("開始開發 writes in_progress on member_candidate_state", async () => {
    const repo = new InMemoryRadarRepository();
    await seedTop20(repo, memberA);
    const result = await applyRadarPartnerAction({
      repo,
      member_id: memberA,
      candidate_id: "cand_threads_kuo.e2323",
      action: "start",
      now,
    });
    expect(result.ok).toBe(true);
    const state = await repo.getMemberCandidateState(memberA, "cand_threads_kuo.e2323");
    expect(state?.development_state).toBe("in_progress");
    expect(state?.excluded_from_recommendations).toBe(true);
    const feed = await loadRadarPartnerFeed({ repo, member_id: memberA, now });
    expect(feed.recommendation_count).toBe(0);
    expect(feed.empty_reason).toBe("all_handled");
  });

  it("shows the member their own protection date, and marks it expired once it lapses", async () => {
    const repo = new InMemoryRadarRepository();
    await seedTop20(repo, memberA);
    await applyRadarPartnerAction({
      repo,
      member_id: memberA,
      candidate_id: "cand_threads_kuo.e2323",
      action: "start",
      now,
    });

    const live = await loadRadarPartnerFeed({ repo, member_id: memberA, now });
    expect(live.my_development).toHaveLength(1);
    expect(live.my_development[0]?.protection_expired).toBe(false);
    expect(formatProtectionDate(live.my_development[0]?.protected_until ?? "")).toBe("2026/11/19");

    const lapsed = await loadRadarPartnerFeed({
      repo,
      member_id: memberA,
      now: new Date("2026-12-01T10:00:00.000Z"),
    });
    expect(lapsed.my_development[0]?.protection_expired).toBe(true);
  });

  it("sizes the list against the rule engine cap, not a number in the copy layer", async () => {
    const repo = new InMemoryRadarRepository();
    await seedTop20(repo, memberA);
    repo.pipelineConfig = { ...repo.pipelineConfig, allocation: { daily_recommendation_cap: 1 } };

    const feed = await loadRadarPartnerFeed({ repo, member_id: memberA, now });

    expect(feed.daily_cap).toBe(1);
    expect(feed.list_size).toBe("full");
  });

  it("略過 excludes without inventing a new table", async () => {
    const repo = new InMemoryRadarRepository();
    await seedTop20(repo, memberA);
    const result = await applyRadarPartnerAction({
      repo,
      member_id: memberA,
      candidate_id: "cand_threads_kuo.e2323",
      action: "skip",
      now,
    });
    expect(result.ok).toBe(true);
    const state = await repo.getMemberCandidateState(memberA, "cand_threads_kuo.e2323");
    expect(state?.development_state).toBeNull();
    expect(state?.excluded_from_recommendations).toBe(true);
    expect(state?.exclusion_reason_code).toBe("skipped");
  });
});
