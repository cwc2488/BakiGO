import { describe, expect, it } from "vitest";
import {
  achievedMilestonePercents,
  applyManualTicketDelta,
  applyWeightReading,
  computeDefaultMeasurementDates,
  computeWeightChangePct,
  rebuildMilestonesForCorrectedWeights,
  replayLiveWeightSequence,
  totalTickets,
} from "@/lib/lose2kg/milestones";
import { pickEqualWinner, pickWeightedWinner } from "@/lib/lose2kg/draw";

describe("lose2kg milestone business rules", () => {
  it("CASE 1: baseline 100 → 99 awards -1 once, weight tickets = 1", () => {
    const result = replayLiveWeightSequence([], 100, [99]);
    expect(result.weightTicketBalance).toBe(1);
    expect(result.milestones.map((m) => m.milestonePercent)).toEqual([1]);
    expect(result.events.filter((e) => e.eventType === "weight_milestone_awarded")).toHaveLength(1);
    expect(computeWeightChangePct(100, 99)).toBeCloseTo(-1, 10);
  });

  it("CASE 2: 100 → 99 → 98 awards -1 and -2, tickets = 2", () => {
    const result = replayLiveWeightSequence([], 100, [99, 98]);
    expect(result.weightTicketBalance).toBe(2);
    expect(result.milestones.map((m) => m.milestonePercent).sort()).toEqual([1, 2]);
  });

  it("CASE 3: 100 → 99 → 98 → 99 does not re-award; tickets roll back to 1", () => {
    const result = replayLiveWeightSequence([], 100, [99, 98, 99]);
    expect(result.milestones).toHaveLength(2);
    expect(result.events.filter((e) => e.eventType === "weight_milestone_awarded")).toHaveLength(2);
    expect(result.weightTicketBalance).toBe(1);
    expect(result.milestones.find((m) => m.milestonePercent === 1)?.ticketState).toBe("active");
    expect(result.milestones.find((m) => m.milestonePercent === 2)?.ticketState).toBe("revoked");
  });

  it("CASE 4: 100 → 99 → 101 → 99 awards -1 only once; no restore after revoke", () => {
    const result = replayLiveWeightSequence([], 100, [99, 101, 99]);
    const awards = result.events.filter((e) => e.eventType === "weight_milestone_awarded");
    expect(awards).toHaveLength(1);
    expect(awards[0]?.relatedMilestone).toBe(1);
    expect(result.weightTicketBalance).toBe(0);
    expect(result.milestones.find((m) => m.milestonePercent === 1)?.ticketState).toBe("revoked");
  });

  it("CASE 5: 100 → 98 crosses -1 and -2 in one step (+2 tickets)", () => {
    const result = replayLiveWeightSequence([], 100, [98]);
    expect(result.weightTicketBalance).toBe(2);
    expect(result.events.filter((e) => e.eventType === "weight_milestone_awarded")).toHaveLength(2);
  });

  it("CASE 6: floating point 100 → 97.9 reaches -2 not -3", () => {
    expect(achievedMilestonePercents(100, 97.9)).toEqual([1, 2]);
    const result = replayLiveWeightSequence([], 100, [97.9]);
    expect(result.weightTicketBalance).toBe(2);
    expect(result.milestones.map((m) => m.milestonePercent)).toEqual([1, 2]);
  });

  it("CASE 7: activity tickets stay when weight tickets revoke", () => {
    const live = replayLiveWeightSequence([], 100, [98]); // weight 2
    expect(live.weightTicketBalance).toBe(2);
    const activity = 3;
    expect(totalTickets(live.weightTicketBalance, activity)).toBe(5);

    const afterRebound = applyWeightReading(live.milestones, 100, 99.2);
    expect(afterRebound.weightTicketBalance).toBe(0);
    expect(totalTickets(afterRebound.weightTicketBalance, activity)).toBe(3);
  });

  it("CASE 8: edit measurement 98 → 99 recalculates without duplicate awards", () => {
    const prior = replayLiveWeightSequence([], 100, [98]);
    expect(prior.weightTicketBalance).toBe(2);

    const rebuilt = rebuildMilestonesForCorrectedWeights(
      prior.milestones.map((m) => m.milestonePercent),
      100,
      [99],
    );
    expect(rebuilt.weightTicketBalance).toBe(1);
    expect(rebuilt.milestones.map((m) => m.milestonePercent).sort()).toEqual([1, 2]);
    expect(rebuilt.events.filter((e) => e.eventType === "weight_milestone_awarded")).toHaveLength(0);
    expect(rebuilt.milestones.find((m) => m.milestonePercent === 1)?.ticketState).toBe("active");
    expect(rebuilt.milestones.find((m) => m.milestonePercent === 2)?.ticketState).toBe("revoked");
  });

  it("manual tickets clamp at 0", () => {
    expect(applyManualTicketDelta(3, 2)).toEqual({ nextBalance: 5, appliedDelta: 2 });
    expect(applyManualTicketDelta(2, -5)).toEqual({ nextBalance: 0, appliedDelta: -2 });
  });

  it("default measurement dates land on Thursdays spaced by 7 days", () => {
    // 2026-09-08 is Tuesday → first Thu 2026-09-10
    expect(computeDefaultMeasurementDates("2026-09-08")).toEqual([
      "2026-09-10",
      "2026-09-17",
      "2026-09-24",
      "2026-10-01",
    ]);
    // Already Thursday
    expect(computeDefaultMeasurementDates("2026-09-10")[0]).toBe("2026-09-10");
  });
});

describe("lose2kg draw selection", () => {
  it("CASE 9: weighted draw is deterministic for a fixed random sequence", () => {
    const candidates = [
      { id: "a", name: "A", tickets: 5 },
      { id: "b", name: "B", tickets: 2 },
      { id: "c", name: "C", tickets: 1 },
    ];
    // roll 0 → first bucket (A)
    expect(pickWeightedWinner(candidates, () => 0).winner.id).toBe("a");
    // roll just below 5/8 → A; at 5/8 → B
    expect(pickWeightedWinner(candidates, () => 5 / 8 - 1e-12).winner.id).toBe("a");
    expect(pickWeightedWinner(candidates, () => 5 / 8).winner.id).toBe("b");
    expect(pickWeightedWinner(candidates, () => 7 / 8).winner.id).toBe("c");
  });

  it("CASE 10: equal temp draw picks one stable winner for same roll", () => {
    const pool = [
      { id: "1", name: "A" },
      { id: "2", name: "B" },
      { id: "3", name: "C" },
    ];
    const a = pickEqualWinner(pool, () => 0.1);
    const b = pickEqualWinner(pool, () => 0.1);
    expect(a.winner.id).toBe(b.winner.id);
    expect(a.poolSize).toBe(3);
  });

  it("weighted proportional frequencies over many trials", () => {
    const candidates = [
      { id: "a", name: "A", tickets: 5 },
      { id: "b", name: "B", tickets: 3 },
    ];
    let seed = 1;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 800; i += 1) {
      const { winner } = pickWeightedWinner(candidates, random);
      counts[winner.id as "a" | "b"] += 1;
    }
    // Expect roughly 5:3
    expect(counts.a).toBeGreaterThan(400);
    expect(counts.b).toBeGreaterThan(200);
    expect(counts.a + counts.b).toBe(800);
  });
});
