import { describe, expect, it } from "vitest";
import {
  assertNoFullPoolScan,
  buildAdaptiveRefreshQueue,
  buildFairDiscoveryPlan,
  interleaveDiscoveryPlansRoundRobin,
} from "./build-refresh-queue";
import type { CandidateRefreshInput } from "./types";

function candidate(
  overrides: Partial<CandidateRefreshInput> & Pick<CandidateRefreshInput, "candidate_id">,
): CandidateRefreshInput {
  return {
    lifecycle_state: "active",
    refresh_tier: "standard",
    is_new_candidate: false,
    source_freshness_expired: false,
    is_stale_recovery: false,
    near_top20_competitive: false,
    new_discovery_hit: false,
    force_refresh: false,
    last_enriched_at: null,
    cooling_interval_days: 14,
    ...overrides,
  };
}

describe("buildAdaptiveRefreshQueue", () => {
  const now = new Date("2026-08-09T03:00:00.000Z");

  it("selects candidates by adaptive signals only", () => {
    const queue = buildAdaptiveRefreshQueue(
      [
        candidate({ candidate_id: "cand_new", is_new_candidate: true }),
        candidate({ candidate_id: "cand_idle" }),
        candidate({ candidate_id: "cand_force", force_refresh: true }),
      ],
      now,
    );

    expect(queue.map((item) => item.candidate_id)).toEqual(["cand_force", "cand_new"]);
  });

  it("does not full-scan the pool when considered count stays below pool size", () => {
    const poolSize = 10_000;
    const adaptiveInputs = [
      candidate({ candidate_id: "cand_1", source_freshness_expired: true }),
      candidate({ candidate_id: "cand_2", near_top20_competitive: true }),
    ];

    expect(() =>
      assertNoFullPoolScan({
        pool_size: poolSize,
        candidates_considered: adaptiveInputs.length,
      }),
    ).not.toThrow();

    expect(() =>
      assertNoFullPoolScan({
        pool_size: poolSize,
        candidates_considered: poolSize,
      }),
    ).toThrow(/full candidate pool scan forbidden/);
  });

  it("excludes globally excluded candidates", () => {
    const queue = buildAdaptiveRefreshQueue(
      [candidate({ candidate_id: "cand_excluded", lifecycle_state: "excluded", force_refresh: true })],
      now,
    );
    expect(queue).toHaveLength(0);
  });
});

describe("buildFairDiscoveryPlan", () => {
  it("allocates baseline quota per member before weight ordering within member", () => {
    const plans = buildFairDiscoveryPlan({
      members: [{ member_id: "m1" }, { member_id: "m2" }],
      keywords_by_member: {
        m1: [
          { keyword_id: "k1", phrase: "a", discovery_weight: 10 },
          { keyword_id: "k2", phrase: "b", discovery_weight: 5 },
          { keyword_id: "k3", phrase: "c", discovery_weight: 1 },
        ],
        m2: [
          { keyword_id: "k4", phrase: "d", discovery_weight: 8 },
          { keyword_id: "k5", phrase: "e", discovery_weight: 2 },
        ],
      },
      baseline_quota_per_member: 2,
    });

    expect(plans.find((plan) => plan.member_id === "m1")?.keywords.map((k) => k.keyword_id)).toEqual([
      "k1",
      "k2",
    ]);
    expect(plans.find((plan) => plan.member_id === "m2")?.keywords.map((k) => k.keyword_id)).toEqual([
      "k4",
      "k5",
    ]);
  });

  it("interleaves members round-robin for fair discovery ordering", () => {
    const plans = buildFairDiscoveryPlan({
      members: [{ member_id: "m1" }, { member_id: "m2" }],
      keywords_by_member: {
        m1: [
          { keyword_id: "k1", phrase: "a", discovery_weight: 10 },
          { keyword_id: "k2", phrase: "b", discovery_weight: 5 },
        ],
        m2: [{ keyword_id: "k3", phrase: "c", discovery_weight: 8 }],
      },
      baseline_quota_per_member: 2,
    });

    const interleaved = interleaveDiscoveryPlansRoundRobin(plans);
    expect(interleaved.map((item) => item.member_id)).toEqual(["m1", "m2", "m1"]);
  });
});
