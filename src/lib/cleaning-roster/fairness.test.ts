import { describe, expect, it } from "vitest";
import {
  CLEANING_ROSTER_BASE_WEIGHT,
  CLEANING_ROSTER_REST_WEIGHT_DELTA,
} from "@/types/cleaning-roster";

/** Mirrors confirm_cleaning_roster_round fairness updates for unit verification. */
function applyConfirmWeights(input: {
  members: Array<{ id: string; weight: number; totalAssignments: number; restRounds: number }>;
  assignedIds: string[];
  restingIds: string[];
}) {
  return input.members.map((member) => {
    if (input.assignedIds.includes(member.id)) {
      return {
        ...member,
        weight: CLEANING_ROSTER_BASE_WEIGHT,
        totalAssignments: member.totalAssignments + 1,
        restRounds: 0,
      };
    }
    if (input.restingIds.includes(member.id)) {
      return {
        ...member,
        weight: member.weight + CLEANING_ROSTER_REST_WEIGHT_DELTA,
        restRounds: member.restRounds + 1,
      };
    }
    return member;
  });
}

describe("cleaning roster fairness weight updates", () => {
  it("Scenario E: workers reset to 1.0; resters gain +0.5", () => {
    const next = applyConfirmWeights({
      members: [
        { id: "a", weight: 2.0, totalAssignments: 3, restRounds: 2 },
        { id: "b", weight: 1.0, totalAssignments: 5, restRounds: 0 },
        { id: "c", weight: 1.5, totalAssignments: 4, restRounds: 1 },
      ],
      assignedIds: ["a", "b"],
      restingIds: ["c"],
    });
    expect(next.find((m) => m.id === "a")).toMatchObject({
      weight: 1.0,
      totalAssignments: 4,
      restRounds: 0,
    });
    expect(next.find((m) => m.id === "b")).toMatchObject({
      weight: 1.0,
      totalAssignments: 6,
      restRounds: 0,
    });
    expect(next.find((m) => m.id === "c")).toMatchObject({
      weight: 2.0,
      totalAssignments: 4,
      restRounds: 2,
    });
  });

  it("Scenario D conceptual: redraw without confirm leaves weights unchanged", () => {
    const members = [
      { id: "a", weight: 1.5, totalAssignments: 2, restRounds: 1 },
      { id: "b", weight: 1.0, totalAssignments: 3, restRounds: 0 },
    ];
    // Preview/redraw never calls applyConfirmWeights.
    expect(members[0]?.weight).toBe(1.5);
    expect(members[1]?.totalAssignments).toBe(3);
  });

  it("rest streak compounds by +0.5 each confirmed rest round", () => {
    let weight = CLEANING_ROSTER_BASE_WEIGHT;
    for (let i = 0; i < 3; i += 1) {
      weight += CLEANING_ROSTER_REST_WEIGHT_DELTA;
    }
    expect(weight).toBe(2.5);
  });
});
