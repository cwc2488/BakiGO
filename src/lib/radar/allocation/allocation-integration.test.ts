import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import { createSourceAdapterRegistry } from "../sources/registry";
import { runRankWorker } from "../jobs/workers/rank-worker";
import { applyRadarPartnerAction } from "../partner/apply-radar-partner-action";
import { loadRadarPartnerFeed } from "../partner/load-radar-partner-feed";
import { RADAR_CLAIM_COLLISION_MESSAGE } from "../partner/radar-partner-presentation";
import type { RadarJobRecord } from "../jobs/types";
import type { OverallScoreResult } from "../scoring/types";
import { DEFAULT_ALLOCATION_RULES, RADAR_ALLOCATION_RULES_VERSION, claimWindow } from "./allocation-rules";

const MEMBER_A = "member-a";
const MEMBER_B = "member-b";
const RUN_DATE = "2026-08-21";
const NOW = new Date("2026-08-21T08:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function scoreResult(overall: number): OverallScoreResult {
  return {
    scoring_version: "v1",
    overall_score: overall,
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
        analyzable_item_count: 10,
        excluded_repost_count: 0,
        excluded_duplicate_count: 0,
        excluded_empty_share_count: 0,
        excluded_no_expression_count: 0,
        excluded_unattributable_count: 0,
      },
      trait_observability: [],
    },
    needs: [],
  };
}

/** A candidate that clears every gate except allocation, for one or more members. */
async function seedScoredCandidate(
  repo: InMemoryRadarRepository,
  input: { candidate_id: string; score: number; members: string[]; now?: Date },
) {
  const now = input.now ?? NOW;
  const analysisRunId = randomUUID();
  const fingerprint = `fp_${input.candidate_id}`;
  const corpusFingerprint = `corpus_${input.candidate_id}`;

  await repo.upsertCandidate({
    id: input.candidate_id,
    display_name: input.candidate_id,
    normalized_username: input.candidate_id.replace(/[^a-z0-9]/g, ""),
  });
  await repo.insertAnalysisRun({
    id: analysisRunId,
    candidate_id: input.candidate_id,
    status: "succeeded",
    analysis_input_fingerprint: fingerprint,
    corpus_fingerprint: corpusFingerprint,
    profile_semantic_hash: null,
    normalization_run_id: `norm_${input.candidate_id}`,
    extraction_json: { candidate_id: input.candidate_id } as never,
    prompt_version: "ai_radar_extraction_v1.0",
    model_id: "gpt-4.1-mini",
  });
  await repo.updateRefreshStateAfterNormalize({
    candidate_id: input.candidate_id,
    corpus_fingerprint: corpusFingerprint,
    profile_semantic_hash: null,
    data_completeness: "full",
    current_analysis_run_id: analysisRunId,
    validated_extraction_fingerprint: fingerprint,
    now,
  });
  await repo.updateRefreshStateAfterEnrich({
    candidate_id: input.candidate_id,
    succeeded: true,
    now,
  });

  for (const member_id of input.members) {
    await repo.insertMemberScoreSnapshot({
      id: randomUUID(),
      member_id,
      candidate_id: input.candidate_id,
      analysis_run_id: analysisRunId,
      baseline_score_snapshot_id: randomUUID(),
      overall_score: input.score,
      component_scores: {},
      location_level: "unknown",
      snapshot_date: RUN_DATE,
      result: scoreResult(input.score),
    });
  }
}

/**
 * Keeps the source-freshness gate satisfied when a test moves the clock. That
 * gate is a separate LIVE contract; these tests are about allocation.
 */
async function refreshSourceAt(repo: InMemoryRadarRepository, candidate_id: string, at: Date) {
  await repo.updateRefreshStateAfterEnrich({ candidate_id, succeeded: true, now: at });
}

function rankJob(member_id: string): RadarJobRecord {
  return {
    id: `rank-${member_id}`,
    pipeline_run_id: null,
    job_type: "rank",
    idempotency_key: `k-${member_id}`,
    status: "running",
    payload: { run_date: RUN_DATE, member_id, artifact_refs: {} },
    priority: 0,
    attempt_count: 1,
    max_attempts: 3,
    scheduled_at: "",
    available_at: "",
    started_at: null,
    finished_at: null,
    error_code: null,
    error_message: null,
    trace_id: null,
    created_at: "",
    updated_at: "",
  };
}

async function rank(repo: InMemoryRadarRepository, member_id: string, now: Date = NOW) {
  for (const candidate_id of repo.candidates.keys()) {
    await refreshSourceAt(repo, candidate_id, now);
  }
  const result = await runRankWorker(
    {
      repo,
      queue: new RadarJobQueue(new InMemoryRadarJobQueueStore()),
      sources: createSourceAdapterRegistry(),
      now,
    },
    rankJob(member_id),
  );
  const snapshot = await repo.getMemberDailyTop20(member_id, RUN_DATE);
  return { result, snapshot };
}

/** Puts a claim in place the way 開始開發 would, then optionally moves the clock. */
async function seedClaim(
  repo: InMemoryRadarRepository,
  input: { candidate_id: string; member_id: string; claimed_at: Date },
) {
  const window = claimWindow({ now: input.claimed_at, rules: DEFAULT_ALLOCATION_RULES });
  const claim = await repo.claimCandidateDevelopment({
    candidate_id: input.candidate_id,
    member_id: input.member_id,
    expires_at: window.expires_at,
    allocatable_at: window.allocatable_at,
    rules_version: RADAR_ALLOCATION_RULES_VERSION,
    now: input.claimed_at,
  });
  await repo.setMemberCandidateState({
    member_id: input.member_id,
    candidate_id: input.candidate_id,
    development_state: "in_progress",
    excluded_from_recommendations: true,
    exclusion_reason_code: null,
  });
  return claim;
}

describe("P2B ranking — quality gate and daily cap come from the rules", () => {
  it("keeps a candidate at the minimum score and drops the one below it", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_40", score: 40, members: [MEMBER_A] });
    await seedScoredCandidate(repo, { candidate_id: "cand_39", score: 39, members: [MEMBER_A] });

    const { result, snapshot } = await rank(repo, MEMBER_A);

    expect(snapshot?.items.map((item) => item.candidateId)).toEqual(["cand_40"]);
    expect(result.metrics?.skipped_below_minimum_score).toBe(1);
  });

  it("returns exactly the 8 qualified candidates instead of padding to the cap", async () => {
    const repo = new InMemoryRadarRepository();
    for (let index = 0; index < 8; index += 1) {
      await seedScoredCandidate(repo, {
        candidate_id: `cand_ok_${index}`,
        score: 55 + index,
        members: [MEMBER_A],
      });
    }
    for (let index = 0; index < 5; index += 1) {
      await seedScoredCandidate(repo, {
        candidate_id: `cand_low_${index}`,
        score: 20 + index,
        members: [MEMBER_A],
      });
    }

    const { snapshot } = await rank(repo, MEMBER_A);

    expect(snapshot?.items).toHaveLength(8);
    expect(
      snapshot?.items.every(
        (item) => item.overall_score >= DEFAULT_ALLOCATION_RULES.minimum_qualified_score,
      ),
    ).toBe(true);
  });

  it("caps the list at the daily maximum when more candidates qualify", async () => {
    const repo = new InMemoryRadarRepository();
    for (let index = 0; index < 25; index += 1) {
      await seedScoredCandidate(repo, {
        candidate_id: `cand_${String(index).padStart(2, "0")}`,
        score: 50 + index,
        members: [MEMBER_A],
      });
    }

    const { snapshot } = await rank(repo, MEMBER_A);

    expect(snapshot?.items).toHaveLength(DEFAULT_ALLOCATION_RULES.daily_recommendation_cap);
    expect(snapshot?.items[0]?.overall_score).toBe(74);
  });
});

describe("P2B ranking — personal exclusions", () => {
  it("hides a skipped candidate for the cooldown and brings it back afterwards", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_skip", score: 70, members: [MEMBER_A] });
    await repo.setMemberCandidateState({
      member_id: MEMBER_A,
      candidate_id: "cand_skip",
      development_state: null,
      excluded_from_recommendations: true,
      exclusion_reason_code: "skipped",
      skip_expires_at: new Date(NOW.getTime() + 30 * DAY_MS),
    });

    const dayBefore = await rank(repo, MEMBER_A, new Date(NOW.getTime() + 29 * DAY_MS));
    expect(dayBefore.snapshot?.items).toHaveLength(0);
    expect(dayBefore.result.metrics?.skipped_member_handled).toBe(1);

    const afterCooldown = await rank(repo, MEMBER_A, new Date(NOW.getTime() + 31 * DAY_MS));
    expect(afterCooldown.snapshot?.items.map((item) => item.candidateId)).toEqual(["cand_skip"]);
  });

  it("never recommends an already-known candidate again", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_known", score: 88, members: [MEMBER_A] });
    await repo.setMemberCandidateState({
      member_id: MEMBER_A,
      candidate_id: "cand_known",
      development_state: "already_known",
      excluded_from_recommendations: true,
      exclusion_reason_code: null,
    });

    const nextYear = await rank(repo, MEMBER_A, new Date(NOW.getTime() + 400 * DAY_MS));
    expect(nextYear.snapshot?.items).toHaveLength(0);
  });

  it("does not exclude other members when one member says 我認識他", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_shared",
      score: 66,
      members: [MEMBER_A, MEMBER_B],
    });
    await repo.setMemberCandidateState({
      member_id: MEMBER_A,
      candidate_id: "cand_shared",
      development_state: "already_known",
      excluded_from_recommendations: true,
      exclusion_reason_code: null,
    });

    expect((await rank(repo, MEMBER_A)).snapshot?.items).toHaveLength(0);
    expect((await rank(repo, MEMBER_B)).snapshot?.items.map((item) => item.candidateId)).toEqual([
      "cand_shared",
    ]);
  });
});

describe("P2B ranking — allocation lock", () => {
  it("puts the same unclaimed candidate in both members' lists", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_open",
      score: 72,
      members: [MEMBER_A, MEMBER_B],
    });

    expect((await rank(repo, MEMBER_A)).snapshot?.items.map((item) => item.candidateId)).toEqual([
      "cand_open",
    ]);
    expect((await rank(repo, MEMBER_B)).snapshot?.items.map((item) => item.candidateId)).toEqual([
      "cand_open",
    ]);
  });

  it("withholds a candidate another member is developing", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_claimed",
      score: 72,
      members: [MEMBER_A, MEMBER_B],
    });
    await seedClaim(repo, { candidate_id: "cand_claimed", member_id: MEMBER_B, claimed_at: NOW });

    const { result, snapshot } = await rank(repo, MEMBER_A);
    expect(snapshot?.items).toHaveLength(0);
    expect(result.metrics?.skipped_allocation_locked).toBe(1);
  });

  it("keeps the candidate locked through the cooldown that follows a natural expiry", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_expiring",
      score: 72,
      members: [MEMBER_A, MEMBER_B],
    });
    await seedClaim(repo, { candidate_id: "cand_expiring", member_id: MEMBER_B, claimed_at: NOW });

    const dayNinetyOne = new Date(NOW.getTime() + 91 * DAY_MS);
    expect((await rank(repo, MEMBER_A, dayNinetyOne)).snapshot?.items).toHaveLength(0);

    const cooldownEnd = new Date(NOW.getTime() + 103 * DAY_MS);
    expect((await rank(repo, MEMBER_A, cooldownEnd)).snapshot?.items).toHaveLength(0);

    const afterCooldown = new Date(NOW.getTime() + 105 * DAY_MS);
    expect(
      (await rank(repo, MEMBER_A, afterCooldown)).snapshot?.items.map((item) => item.candidateId),
    ).toEqual(["cand_expiring"]);
  });

  it("does not turn a natural expiry into a member decision", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_lapsed", score: 72, members: [MEMBER_B] });
    await seedClaim(repo, { candidate_id: "cand_lapsed", member_id: MEMBER_B, claimed_at: NOW });

    await rank(repo, MEMBER_B, new Date(NOW.getTime() + 120 * DAY_MS));

    const claim = await repo.getCandidateDevelopmentClaim("cand_lapsed");
    expect(claim?.released_at).toBeNull();
    expect(claim?.release_reason).toBeNull();
    const state = await repo.getMemberCandidateState(MEMBER_B, "cand_lapsed");
    expect(state?.development_state).toBe("in_progress");
    expect(repo.candidateClaimEvents.some((event) => event.reason === "gave_up")).toBe(false);
  });

  it("never returns a converted candidate to allocation", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_converted",
      score: 91,
      members: [MEMBER_A, MEMBER_B],
    });
    await seedClaim(repo, { candidate_id: "cand_converted", member_id: MEMBER_B, claimed_at: NOW });
    await repo.releaseCandidateDevelopmentClaim({
      candidate_id: "cand_converted",
      member_id: MEMBER_B,
      released_at: NOW,
      release_reason: "converted",
      allocatable_at: { kind: "never" },
    });

    const yearsLater = new Date(NOW.getTime() + 4000 * DAY_MS);
    expect((await rank(repo, MEMBER_A, yearsLater)).snapshot?.items).toHaveLength(0);
  });
});

describe("P2B actions — 開始開發", () => {
  async function seedSnapshotFor(repo: InMemoryRadarRepository, member_id: string) {
    return rank(repo, member_id);
  }

  it("claims the candidate, marks it in development and reports the protection date", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_start", score: 77, members: [MEMBER_A] });
    await seedSnapshotFor(repo, MEMBER_A);

    const result = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_start",
      action: "start",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.protected_until).toBe(new Date(NOW.getTime() + 90 * DAY_MS).toISOString());
    const state = await repo.getMemberCandidateState(MEMBER_A, "cand_start");
    expect(state?.development_state).toBe("in_progress");
    const claim = await repo.getCandidateDevelopmentClaim("cand_start");
    expect(claim?.member_id).toBe(MEMBER_A);
  });

  it("answers a collision with neutral copy that names nobody", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_race",
      score: 77,
      members: [MEMBER_A, MEMBER_B],
    });
    await seedSnapshotFor(repo, MEMBER_A);
    await seedSnapshotFor(repo, MEMBER_B);

    const winner = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_B,
      candidate_id: "cand_race",
      action: "start",
      now: NOW,
    });
    const loser = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_race",
      action: "start",
      now: NOW,
    });

    expect(winner.ok).toBe(true);
    expect(loser.ok).toBe(false);
    if (loser.ok) return;
    expect(loser.status).toBe(409);
    expect(loser.error).toBe(RADAR_CLAIM_COLLISION_MESSAGE);
    expect(loser.code).toBe("candidate_unavailable");
    expect(JSON.stringify(loser)).not.toContain(MEMBER_B);
    expect(JSON.stringify(loser)).not.toContain("claim");
    expect(await repo.getMemberCandidateState(MEMBER_A, "cand_race")).toBeNull();
  });

  it("does not extend the protection when the holder clicks again", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_retry", score: 77, members: [MEMBER_A] });
    await seedSnapshotFor(repo, MEMBER_A);

    const first = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_retry",
      action: "start",
      now: NOW,
    });
    const retry = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_retry",
      action: "start",
      now: new Date(NOW.getTime() + 3 * 60 * 60 * 1000),
    });

    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.protected_until).toBe(first.protected_until);
    const claim = await repo.getCandidateDevelopmentClaim("cand_retry");
    expect(claim?.expires_at).toBe(first.protected_until);
    expect(repo.candidateClaimEvents.filter((event) => event.event === "claimed")).toHaveLength(1);
  });

  it("keeps the claim untouched at repository level on a same-member retry", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_idem", score: 77, members: [MEMBER_A] });
    const first = await seedClaim(repo, {
      candidate_id: "cand_idem",
      member_id: MEMBER_A,
      claimed_at: NOW,
    });

    const later = new Date(NOW.getTime() + 10 * DAY_MS);
    const window = claimWindow({ now: later, rules: DEFAULT_ALLOCATION_RULES });
    const retry = await repo.claimCandidateDevelopment({
      candidate_id: "cand_idem",
      member_id: MEMBER_A,
      expires_at: window.expires_at,
      allocatable_at: window.allocatable_at,
      rules_version: RADAR_ALLOCATION_RULES_VERSION,
      now: later,
    });

    expect(retry?.expires_at).toBe(first?.expires_at);
    expect(retry?.claimed_at).toBe(first?.claimed_at);
  });
});

describe("P2B actions — 略過, 我認識他 and explicit outcomes", () => {
  it("stores the skip cooldown expiry from the rules", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_skip2", score: 77, members: [MEMBER_A] });
    await rank(repo, MEMBER_A);

    await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_skip2",
      action: "skip",
      now: NOW,
    });

    const state = await repo.getMemberCandidateState(MEMBER_A, "cand_skip2");
    expect(state?.exclusion_reason_code).toBe("skipped");
    expect(state?.skip_expires_at).toBe(new Date(NOW.getTime() + 30 * DAY_MS).toISOString());
    expect(await repo.getCandidateDevelopmentClaim("cand_skip2")).toBeNull();
  });

  it("excludes only this member on 我認識他 and creates no claim", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_known2",
      score: 77,
      members: [MEMBER_A, MEMBER_B],
    });
    await rank(repo, MEMBER_A);

    await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_known2",
      action: "already_known",
      now: NOW,
    });

    expect(await repo.getCandidateDevelopmentClaim("cand_known2")).toBeNull();
    expect(
      (await rank(repo, MEMBER_B)).snapshot?.items.map((item) => item.candidateId),
    ).toEqual(["cand_known2"]);
  });

  it("releases early on gave_up and holds the candidate for the global cooldown", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_gaveup",
      score: 77,
      members: [MEMBER_A, MEMBER_B],
    });
    await rank(repo, MEMBER_B);
    await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_B,
      candidate_id: "cand_gaveup",
      action: "start",
      now: NOW,
    });

    const releasedAt = new Date(NOW.getTime() + 5 * DAY_MS);
    const release = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_B,
      candidate_id: "cand_gaveup",
      action: "gave_up",
      now: releasedAt,
    });

    expect(release.ok).toBe(true);
    const claim = await repo.getCandidateDevelopmentClaim("cand_gaveup");
    expect(claim?.release_reason).toBe("gave_up");
    expect(claim?.allocatable_at).toBe(new Date(releasedAt.getTime() + 14 * DAY_MS).toISOString());

    const duringCooldown = new Date(releasedAt.getTime() + 13 * DAY_MS);
    expect((await rank(repo, MEMBER_A, duringCooldown)).snapshot?.items).toHaveLength(0);

    const afterCooldown = new Date(releasedAt.getTime() + 15 * DAY_MS);
    expect(
      (await rank(repo, MEMBER_A, afterCooldown)).snapshot?.items.map((item) => item.candidateId),
    ).toEqual(["cand_gaveup"]);
  });

  it("refuses an outcome from a member who does not hold the claim", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, {
      candidate_id: "cand_notmine",
      score: 77,
      members: [MEMBER_A, MEMBER_B],
    });
    await seedClaim(repo, { candidate_id: "cand_notmine", member_id: MEMBER_B, claimed_at: NOW });

    const result = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_notmine",
      action: "failed",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(JSON.stringify(result)).not.toContain(MEMBER_B);
    const claim = await repo.getCandidateDevelopmentClaim("cand_notmine");
    expect(claim?.released_at).toBeNull();
  });
});

describe("P2B read model — what the Partner is allowed to see", () => {
  it("shows the member's own protection date and nothing about anyone else", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_mine", score: 80, members: [MEMBER_A] });
    await seedScoredCandidate(repo, {
      candidate_id: "cand_theirs",
      score: 79,
      members: [MEMBER_A, MEMBER_B],
    });
    await rank(repo, MEMBER_A);
    await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_mine",
      action: "start",
      now: NOW,
    });
    await seedClaim(repo, { candidate_id: "cand_theirs", member_id: MEMBER_B, claimed_at: NOW });

    const feed = await loadRadarPartnerFeed({ repo, member_id: MEMBER_A, now: NOW });

    expect(feed.items).toHaveLength(0);
    expect(feed.daily_cap).toBe(DEFAULT_ALLOCATION_RULES.daily_recommendation_cap);
    expect(feed.my_development).toEqual([
      {
        candidate_id: "cand_mine",
        username: "candmine",
        protected_until: new Date(NOW.getTime() + 90 * DAY_MS).toISOString(),
        protection_expired: false,
      },
    ]);
    const payload = JSON.stringify(feed);
    expect(payload).not.toContain(MEMBER_B);
    expect(payload).not.toContain("allocatable_at");
    expect(payload).not.toContain("rules_version");
    expect(payload).not.toContain("cand_theirs");
  });

  it("marks lapsed protection as expired without claiming the member gave up", async () => {
    const repo = new InMemoryRadarRepository();
    await seedScoredCandidate(repo, { candidate_id: "cand_lapse", score: 80, members: [MEMBER_A] });
    await rank(repo, MEMBER_A);
    await applyRadarPartnerAction({
      repo,
      member_id: MEMBER_A,
      candidate_id: "cand_lapse",
      action: "start",
      now: NOW,
    });

    const feed = await loadRadarPartnerFeed({
      repo,
      member_id: MEMBER_A,
      now: new Date(NOW.getTime() + 95 * DAY_MS),
    });

    expect(feed.my_development[0]?.protection_expired).toBe(true);
    const state = await repo.getMemberCandidateState(MEMBER_A, "cand_lapse");
    expect(state?.development_state).toBe("in_progress");
  });
});
