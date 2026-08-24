import { describe, expect, it } from "vitest";
import {
  CLAIM_RELEASE_REASONS,
  DEFAULT_ALLOCATION_RULES,
  capDailyRecommendations,
  claimWindow,
  isClaimBlocking,
  isSkipStillActive,
  meetsMinimumQualifiedScore,
  parseAllocationRules,
  releaseAllocatableAt,
  skipExpiresAt,
} from "./allocation-rules";

const rules = DEFAULT_ALLOCATION_RULES;
const now = new Date("2026-08-21T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("allocation rule constants", () => {
  it("matches the values confirmed in BUSINESS_RULES", () => {
    expect(rules).toEqual({
      skip_cooldown_days: 30,
      development_claim_days: 90,
      post_release_global_cooldown_days: 14,
      minimum_qualified_score: 40,
      daily_recommendation_cap: 20,
    });
  });

  it("falls back to defaults for missing or invalid config", () => {
    expect(parseAllocationRules(null)).toEqual(rules);
    expect(
      parseAllocationRules({
        skip_cooldown_days: "30",
        development_claim_days: -1,
        minimum_qualified_score: Number.NaN,
      }),
    ).toEqual(rules);
  });

  it("accepts operator overrides", () => {
    const overridden = parseAllocationRules({ minimum_qualified_score: 55 });
    expect(overridden.minimum_qualified_score).toBe(55);
    expect(overridden.development_claim_days).toBe(90);
  });
});

describe("skip cooldown", () => {
  it("expires 30 days after the skip", () => {
    expect(skipExpiresAt({ now, rules }).getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("blocks until the expiry instant, then stops blocking", () => {
    const expires = skipExpiresAt({ now, rules });
    expect(isSkipStillActive({ skip_expires_at: expires, now })).toBe(true);
    expect(isSkipStillActive({ skip_expires_at: expires, now: expires })).toBe(false);
  });

  it("treats a null expiry as no active skip", () => {
    expect(isSkipStillActive({ skip_expires_at: null, now })).toBe(false);
  });
});

describe("development claim window", () => {
  it("expires after 90 days and stays blocked for a further 14", () => {
    const claim = claimWindow({ now, rules });
    expect(claim.expires_at.getTime()).toBe(now.getTime() + 90 * DAY);
    expect(claim.allocatable_at).toEqual({
      kind: "at",
      at: new Date(now.getTime() + 104 * DAY),
    });
  });

  it("keeps blocking at natural expiry without any sweeper run", () => {
    const claim = claimWindow({ now, rules });
    const atExpiry = claim.expires_at;
    expect(
      isClaimBlocking({ allocatable_at: claim.allocatable_at, now: atExpiry }),
    ).toBe(true);
  });

  it("becomes allocatable exactly at allocatable_at", () => {
    const claim = claimWindow({ now, rules });
    const allocatable = claim.allocatable_at;
    if (allocatable.kind !== "at") throw new Error("expected a timestamp");
    expect(isClaimBlocking({ allocatable_at: allocatable, now: allocatable.at })).toBe(
      false,
    );
  });
});

describe("claim release", () => {
  it("runs the 14-day cooldown from the release, earlier than natural expiry", () => {
    const claim = claimWindow({ now, rules });
    const released_at = new Date(now.getTime() + 3 * DAY);

    for (const reason of ["failed", "gave_up"] as const) {
      const allocatable = releaseAllocatableAt({ released_at, reason, rules });
      if (allocatable.kind !== "at") throw new Error("expected a timestamp");
      expect(allocatable.at.getTime()).toBe(released_at.getTime() + 14 * DAY);
      if (claim.allocatable_at.kind !== "at") throw new Error("expected a timestamp");
      expect(allocatable.at.getTime()).toBeLessThan(claim.allocatable_at.at.getTime());
    }
  });

  it("never reallocates a candidate who became a Customer", () => {
    const allocatable = releaseAllocatableAt({
      released_at: now,
      reason: "converted",
      rules,
    });
    expect(allocatable).toEqual({ kind: "never" });
    expect(
      isClaimBlocking({
        allocatable_at: allocatable,
        now: new Date(now.getTime() + 3650 * DAY),
      }),
    ).toBe(true);
  });

  it("enumerates every release reason the schema allows", () => {
    expect([...CLAIM_RELEASE_REASONS]).toEqual([
      "failed",
      "gave_up",
      "expired",
      "converted",
    ]);
  });
});

describe("quality gate and daily cap", () => {
  it("rejects anything below 40 on the unrounded score", () => {
    expect(meetsMinimumQualifiedScore(39.9, rules)).toBe(false);
    expect(meetsMinimumQualifiedScore(40, rules)).toBe(true);
  });

  it("caps at 20 and never pads a short list", () => {
    const ranked = Array.from({ length: 25 }, (_, index) => ({ candidateId: `c${index}` }));
    const fresh = { already_recommended_today: new Set<string>(), rules };
    expect(capDailyRecommendations(ranked, fresh)).toHaveLength(20);
    expect(capDailyRecommendations(ranked.slice(0, 3), fresh)).toHaveLength(3);
    expect(capDailyRecommendations([], fresh)).toEqual([]);
  });

  it("counts the day, not the run, so a re-run cannot exceed the cap", () => {
    const ranked = Array.from({ length: 25 }, (_, index) => ({ candidateId: `c${index}` }));
    const already = new Set(ranked.slice(0, 18).map((item) => item.candidateId));

    const kept = capDailyRecommendations(ranked, {
      already_recommended_today: already,
      rules,
    });

    expect(kept).toHaveLength(20);
    // The 18 already recommended today keep their place; only 2 new ones fit.
    expect(kept.filter((item) => !already.has(item.candidateId))).toHaveLength(2);
  });

  it("adds nobody new once the day's cap is already spent", () => {
    const ranked = [{ candidateId: "c_new" }, { candidateId: "c_old" }];
    const already = new Set([
      "c_old",
      ...Array.from({ length: 19 }, (_, index) => `c_handled_${index}`),
    ]);

    const kept = capDailyRecommendations(ranked, {
      already_recommended_today: already,
      rules,
    });

    expect(kept.map((item) => item.candidateId)).toEqual(["c_old"]);
  });
});
