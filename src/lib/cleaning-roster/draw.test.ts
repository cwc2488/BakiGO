import {
  countAssignmentsByMember,
  drawCleaningRoster,
  pickWeightedMember,
  pickWeightedWithoutReplacement,
} from "@/lib/cleaning-roster/draw";
import { describe, expect, it } from "vitest";

function cycleRandom(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length]!;
    index += 1;
    return value;
  };
}

describe("cleaning roster weighted draw", () => {
  it("picks by weight proportionally (deterministic)", () => {
    const pool = [
      { id: "a", name: "A", weight: 1 },
      { id: "b", name: "B", weight: 1 },
      { id: "c", name: "C", weight: 2 },
    ];
    // total 4; 0.0→A, 0.24→A, 0.25→B, 0.49→B, 0.5→C, 0.99→C
    expect(pickWeightedMember(pool, () => 0).id).toBe("a");
    expect(pickWeightedMember(pool, () => 0.24).id).toBe("a");
    expect(pickWeightedMember(pool, () => 0.25).id).toBe("b");
    expect(pickWeightedMember(pool, () => 0.49).id).toBe("b");
    expect(pickWeightedMember(pool, () => 0.5).id).toBe("c");
    expect(pickWeightedMember(pool, () => 0.99).id).toBe("c");
  });

  it("does not pick the same member twice without replacement", () => {
    const pool = [
      { id: "a", name: "A", weight: 10 },
      { id: "b", name: "B", weight: 1 },
      { id: "c", name: "C", weight: 1 },
    ];
    const picked = pickWeightedWithoutReplacement(pool, 3, cycleRandom([0.01, 0.01, 0.01]));
    expect(new Set(picked.map((m) => m.id)).size).toBe(3);
  });

  it("Scenario A: 5 members / 3 areas → 3 work, 2 rest, unique workers", () => {
    const areas = [
      { id: "1", name: "廁所" },
      { id: "2", name: "櫃台" },
      { id: "3", name: "器材區" },
    ];
    const members = [
      { id: "a", name: "A", weight: 1 },
      { id: "b", name: "B", weight: 1 },
      { id: "c", name: "C", weight: 2 },
      { id: "d", name: "D", weight: 1.5 },
      { id: "e", name: "E", weight: 1 },
    ];
    const result = drawCleaningRoster(areas, members);
    expect(result.assignments).toHaveLength(3);
    expect(result.resting).toHaveLength(2);
    const workerIds = result.assignments.map((a) => a.memberId);
    expect(new Set(workerIds).size).toBe(3);
    const allIds = new Set([...workerIds, ...result.resting.map((r) => r.memberId)]);
    expect(allIds.size).toBe(5);
  });

  it("Scenario B: 3 members / 3 areas → everyone works once", () => {
    const areas = [
      { id: "1", name: "廁所" },
      { id: "2", name: "櫃台" },
      { id: "3", name: "器材區" },
    ];
    const members = [
      { id: "a", name: "A", weight: 1 },
      { id: "b", name: "B", weight: 1 },
      { id: "c", name: "C", weight: 1 },
    ];
    const result = drawCleaningRoster(areas, members);
    expect(result.assignments).toHaveLength(3);
    expect(result.resting).toHaveLength(0);
    expect(new Set(result.assignments.map((a) => a.memberId)).size).toBe(3);
  });

  it("Scenario C: 3 members / 5 areas → loads 2/2/1", () => {
    const areas = [
      { id: "1", name: "廁所" },
      { id: "2", name: "櫃台" },
      { id: "3", name: "器材區" },
      { id: "4", name: "樓梯" },
      { id: "5", name: "更衣室" },
    ];
    const members = [
      { id: "a", name: "A", weight: 1 },
      { id: "b", name: "B", weight: 1 },
      { id: "c", name: "C", weight: 1 },
    ];
    const result = drawCleaningRoster(areas, members);
    expect(result.assignments).toHaveLength(5);
    expect(result.resting).toHaveLength(0);
    const counts = [...countAssignmentsByMember(result).values()].sort((x, y) => y - x);
    expect(counts).toEqual([2, 2, 1]);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it("works with a single member and multiple areas", () => {
    const result = drawCleaningRoster(
      [
        { id: "1", name: "廁所" },
        { id: "2", name: "櫃台" },
      ],
      [{ id: "a", name: "A", weight: 1 }],
    );
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.every((a) => a.memberId === "a")).toBe(true);
    expect(result.resting).toHaveLength(0);
  });

  it("favors higher weight over many trials without guaranteeing win", () => {
    const members = [
      { id: "low", name: "Low", weight: 1 },
      { id: "high", name: "High", weight: 3 },
    ];
    const areas = [{ id: "1", name: "廁所" }];
    let highWins = 0;
    const trials = 400;
    for (let i = 0; i < trials; i += 1) {
      const result = drawCleaningRoster(areas, members);
      if (result.assignments[0]?.memberId === "high") highWins += 1;
    }
    // Expected ~75%; allow wide band for randomness.
    expect(highWins).toBeGreaterThan(trials * 0.55);
    expect(highWins).toBeLessThan(trials * 0.92);
  });
});
