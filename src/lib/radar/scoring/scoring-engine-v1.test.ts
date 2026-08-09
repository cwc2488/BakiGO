import { describe, expect, it } from "vitest";
import {
  computeActivityScore,
  computeCoreTraitsScore,
  computeLocationScore,
  computeNeedsFitScore,
  computeOverallScore,
  rankCandidates,
  roundScoreForDisplay,
} from "@/lib/radar";
import type {
  AiRadarExtraction,
  CoreTraitEvidenceInput,
  TraitEvidenceEventInput,
} from "@/lib/radar/scoring/types";

const REF = new Date("2026-08-09T12:00:00.000Z");

function perfectWindowExtraction(): AiRadarExtraction {
  return {
    changeWindow: {
      changeIntent: "strong",
      behavioralChange: "committed_action",
      solutionGap: "active_gap",
    },
    needs: [
      {
        needId: "body",
        strength: "strong",
        relevance: "high_fit",
      },
    ],
    contactability: {
      naturalEntry: "high_leverage",
      interactionOpenness: "highly_open",
    },
    activity: { daysSinceLastMeaningfulActivity: 1 },
    location: { level: "same_district" },
    coreTraits: [],
  };
}

function event(
  partial: Partial<TraitEvidenceEventInput> &
    Pick<TraitEvidenceEventInput, "event_id">,
): TraitEvidenceEventInput {
  return {
    event_timestamp: "2026-07-01T00:00:00.000Z",
    context_categories: ["personal_goals"],
    evidence_strength: "positive",
    evidence_quality: "contextual",
    ...partial,
  };
}

describe("AI Radar Scoring Engine v1 — acceptance tests", () => {
  it("TEST 1 — Perfect Window yields very high Overall Score", () => {
    const result = computeOverallScore(perfectWindowExtraction(), REF);
    expect(result.overall_score).toBeGreaterThanOrEqual(85);
    expect(result.components.change_window_score).toBe(40);
    expect(result.components.needs_fit_score).toBe(25);
  });

  it("TEST 2 — Socially attractive but no Need must not rank near Perfect Window", () => {
    const perfect = computeOverallScore(perfectWindowExtraction(), REF);
    const social = computeOverallScore(
      {
        changeWindow: {
          changeIntent: "none",
          behavioralChange: "none",
          solutionGap: "closed",
        },
        needs: [{ needId: "x", strength: "none", relevance: "unrelated" }],
        contactability: {
          naturalEntry: "generic",
          interactionOpenness: "highly_open",
        },
        activity: { daysSinceLastMeaningfulActivity: 1 },
        location: { level: "same_city" },
        coreTraits: [],
      },
      REF,
    );

    expect(social.overall_score).toBeLessThan(perfect.overall_score - 30);
  });

  it("TEST 3 — Strong Need with unrelated relevance → Needs/Fit = 0", () => {
    const { needs_fit_score } = computeNeedsFitScore([
      { needId: "a", strength: "strong", relevance: "unrelated" },
    ]);
    expect(needs_fit_score).toBe(0);
  });

  it("TEST 4 — Multiple Needs uses MAX not SUM", () => {
    const { needs_fit_score, need_scores } = computeNeedsFitScore([
      { needId: "body", strength: "strong", relevance: "high_fit" },
      { needId: "income", strength: "clear", relevance: "high_fit" },
    ]);
    expect(needs_fit_score).toBe(25);
    expect(need_scores.find((n) => n.needId === "income")?.score).toBeCloseTo(
      16.75,
      2,
    );
  });

  it("TEST 5 — Strong behavior with closed Solution Gap does not max Change Window", () => {
    const result = computeOverallScore(
      {
        ...perfectWindowExtraction(),
        changeWindow: {
          changeIntent: "clear",
          behavioralChange: "committed_action",
          solutionGap: "closed",
        },
      },
      REF,
    );
    expect(result.components.behavioral_change_score).toBe(13);
    expect(result.components.solution_gap_score).toBe(0);
    expect(result.components.change_window_score).toBeLessThan(40);
  });

  it("TEST 6 — Ambiguous positive spam cannot unlock Strong/Very Strong", () => {
    const traits: CoreTraitEvidenceInput[] = [
      {
        trait_id: "consistency_resilience",
        evidence_events: Array.from({ length: 10 }, (_, i) =>
          event({
            event_id: `a${i}`,
            evidence_strength: "positive",
            evidence_quality: "ambiguous",
          }),
        ),
      },
    ];
    const result = computeCoreTraitsScore(traits, undefined, REF);
    const trait = result.trait_scores[0];
    expect(["moderate", "insufficient"]).toContain(trait.effective_trait_level);
    expect(trait.effective_trait_level).not.toBe("strong");
    expect(trait.effective_trait_level).not.toBe("very_strong");
  });

  it("TEST 7 — Ambiguous contradictory spam cannot unlock Weak", () => {
    const traits: CoreTraitEvidenceInput[] = [
      {
        trait_id: "consistency_resilience",
        evidence_events: Array.from({ length: 10 }, (_, i) =>
          event({
            event_id: `c${i}`,
            evidence_strength: "contradictory",
            evidence_quality: "ambiguous",
            event_timestamp: i < 5 ? "2026-07-01T00:00:00.000Z" : "2026-06-01T00:00:00.000Z",
          }),
        ),
      },
    ];
    const result = computeCoreTraitsScore(traits, undefined, REF);
    expect(result.trait_scores[0].effective_trait_level).toBe("insufficient");
    expect(result.trait_scores[0].negative_signal_present).toBe(true);
  });

  it("TEST 8 — Very Strong requires direct; 3 contextual max = strong", () => {
    const contextualOnly: CoreTraitEvidenceInput[] = [
      {
        trait_id: "consistency_resilience",
        evidence_events: [
          event({
            event_id: "c1",
            evidence_strength: "positive_strong",
            evidence_quality: "contextual",
            event_timestamp: "2026-08-01T00:00:00.000Z",
          }),
          event({
            event_id: "c2",
            evidence_strength: "positive_strong",
            evidence_quality: "contextual",
            event_timestamp: "2026-07-01T00:00:00.000Z",
          }),
          event({
            event_id: "c3",
            evidence_strength: "positive_strong",
            evidence_quality: "contextual",
            event_timestamp: "2026-06-01T00:00:00.000Z",
          }),
        ],
      },
    ];
    const withoutDirect = computeCoreTraitsScore(contextualOnly, undefined, REF);
    expect(withoutDirect.trait_scores[0].effective_trait_level).toBe("strong");

    const withDirect = computeCoreTraitsScore(
      [
        {
          trait_id: "consistency_resilience",
          evidence_events: [
            ...contextualOnly[0].evidence_events,
            event({
              event_id: "d1",
              evidence_strength: "positive_strong",
              evidence_quality: "direct",
              event_timestamp: "2026-08-05T00:00:00.000Z",
            }),
          ],
        },
      ],
      undefined,
      REF,
    );
    expect(withDirect.trait_scores[0].effective_trait_level).toBe("very_strong");
  });

  it("TEST 9 — Weak requires direct contradictory evidence", () => {
    const contextualContradictory: CoreTraitEvidenceInput[] = [
      {
        trait_id: "consistency_resilience",
        evidence_events: [
          event({
            event_id: "w1",
            evidence_strength: "contradictory_strong",
            evidence_quality: "contextual",
            event_timestamp: "2026-08-01T00:00:00.000Z",
          }),
          event({
            event_id: "w2",
            evidence_strength: "contradictory",
            evidence_quality: "contextual",
            event_timestamp: "2026-07-01T00:00:00.000Z",
          }),
          event({
            event_id: "w3",
            evidence_strength: "contradictory",
            evidence_quality: "contextual",
            event_timestamp: "2026-06-01T00:00:00.000Z",
          }),
        ],
      },
    ];
    const noDirect = computeCoreTraitsScore(
      contextualContradictory,
      undefined,
      REF,
    );
    expect(noDirect.trait_scores[0].effective_trait_level).toBe("insufficient");

    const withDirect = computeCoreTraitsScore(
      [
        {
          trait_id: "consistency_resilience",
          evidence_events: [
            ...contextualContradictory[0].evidence_events,
            event({
              event_id: "wd1",
              evidence_strength: "contradictory_strong",
              evidence_quality: "direct",
              event_timestamp: "2026-08-05T00:00:00.000Z",
            }),
          ],
        },
      ],
      undefined,
      REF,
    );
    expect(withDirect.trait_scores[0].effective_trait_level).toBe("weak");
  });

  it("TEST 10 — Same behavioral occurrence in 3 posts → one event per trait", () => {
    const traits: CoreTraitEvidenceInput[] = [
      {
        trait_id: "consistency_resilience",
        evidence_events: [
          event({ event_id: "same", evidence_strength: "positive", evidence_quality: "direct" }),
          event({ event_id: "same", evidence_strength: "positive", evidence_quality: "direct" }),
          event({ event_id: "same", evidence_strength: "positive", evidence_quality: "direct" }),
        ],
      },
    ];
    const result = computeCoreTraitsScore(traits, undefined, REF);
    expect(result.trait_scores[0].directional_evidence_event_count).toBe(1);
  });

  it("TEST 11 — Longitudinal story may produce multiple events with story_id", () => {
    const traits: CoreTraitEvidenceInput[] = [
      {
        trait_id: "consistency_resilience",
        evidence_events: [
          event({
            event_id: "stage1",
            story_id: "marathon",
            event_timestamp: "2026-08-01T00:00:00.000Z",
          }),
          event({
            event_id: "stage2",
            story_id: "marathon",
            event_timestamp: "2026-06-01T00:00:00.000Z",
          }),
        ],
      },
    ];
    const result = computeCoreTraitsScore(traits, undefined, REF);
    expect(result.trait_scores[0].directional_evidence_event_count).toBe(2);
  });

  it("TEST 12 — Cross-trait reuse: same event_id across traits, once per trait", () => {
    const shared = event({
      event_id: "team-finish",
      evidence_strength: "positive_strong",
      evidence_quality: "direct",
    });
    const traits: CoreTraitEvidenceInput[] = [
      { trait_id: "consistency_resilience", evidence_events: [shared] },
      { trait_id: "responsibility_commitment", evidence_events: [shared] },
      { trait_id: "team_collaboration", evidence_events: [shared] },
    ];
    const result = computeCoreTraitsScore(traits, undefined, REF);
    const resilience = result.trait_scores.find(
      (t) => t.trait_id === "consistency_resilience",
    );
    const team = result.trait_scores.find(
      (t) => t.trait_id === "team_collaboration",
    );
    expect(resilience?.directional_evidence_event_count).toBe(1);
    expect(team?.directional_evidence_event_count).toBe(1);
    expect(resilience?.evidence_events[0].event_id).toBe("team-finish");
    expect(team?.evidence_events[0].event_id).toBe("team-finish");
  });

  it("TEST 13 — Low observability is metadata and does not reduce Recommendation Score", () => {
    const base = perfectWindowExtraction();
    const withLowObs = computeOverallScore(
      {
        ...base,
        profileObservability: {
          analyzableItems: Array.from({ length: 3 }, (_, i) => ({
            id: `p${i}`,
            timestamp: "2026-08-01T00:00:00.000Z",
            isCandidateOriginated: true,
            hasMeaningfulExpression: true,
            isReliablyAttributable: true,
          })),
        },
      },
      REF,
    );
    const withoutObs = computeOverallScore(base, REF);
    expect(withLowObs.core_traits.profile_observability.profile_observability_level).toBe(
      "low",
    );
    expect(withLowObs.overall_score).toBe(withoutObs.overall_score);
  });

  it("TEST 14 — Activity freshness: 1 post vs 30 posts same day both = 5", () => {
    expect(
      computeActivityScore({ daysSinceLastMeaningfulActivity: 1 }),
    ).toBe(5);
    expect(
      computeActivityScore({ daysSinceLastMeaningfulActivity: 0 }),
    ).toBe(5);
  });

  it("TEST 15 — Location unknown = 0, not negative inference", () => {
    expect(computeLocationScore({ level: "unknown" })).toBe(0);
  });

  it("TEST 16 — Ranking uses full precision; UI rounds to 1 decimal", () => {
    const ranked = rankCandidates([
      {
        candidateId: "A",
        result: {
          ...computeOverallScore(perfectWindowExtraction(), REF),
          overall_score: 83.74,
        },
      },
      {
        candidateId: "B",
        result: {
          ...computeOverallScore(perfectWindowExtraction(), REF),
          overall_score: 83.71,
        },
      },
    ]);

    expect(ranked[0].candidateId).toBe("A");
    expect(roundScoreForDisplay(83.74)).toBe(83.7);
    expect(roundScoreForDisplay(83.71)).toBe(83.7);
    expect(ranked[0].overall_score).toBeGreaterThan(ranked[1].overall_score);
  });
});
