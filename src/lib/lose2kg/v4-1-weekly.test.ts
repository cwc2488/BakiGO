import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDefaultMeasurementDates,
  computeWeightChangePct,
  rebuildMilestonesForCorrectedWeights,
  replayLiveWeightSequence,
} from "@/lib/lose2kg/milestones";
import { buildTicketBreakdown } from "@/lib/lose2kg/ticket-breakdown";
import type { Lose2kgMeasurement } from "@/types/lose2kg";

function m(slot: 1 | 2 | 3 | 4, weightKg: number | null): Lose2kgMeasurement {
  return {
    id: `m${slot}`,
    periodId: "p",
    participantId: "u",
    slot,
    weightKg,
    measuredAt: null,
    weightChangePct: null,
    createdAt: "",
    updatedAt: "",
  };
}

const DATES: [string, string, string, string] = [
  "2026-09-10",
  "2026-09-17",
  "2026-09-24",
  "2026-10-01",
];

describe("lose2kg V4.1 weekly slot model", () => {
  it("weekly dates: first measure auto +7 days each", () => {
    expect(computeDefaultMeasurementDates("2026-09-10")).toEqual(DATES);
  });

  it("CASE 1: slot1 baseline → 0% · 0 weight tickets", () => {
    const rebuilt = rebuildMilestonesForCorrectedWeights([], 100, [null, null, null]);
    expect(rebuilt.weightTicketBalance).toBe(0);
    expect(rebuilt.weightChangePct).toBeNull();
    expect(computeWeightChangePct(100, 100)).toBeCloseTo(0, 10);

    const b = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements: [m(1, 100), m(2, null), m(3, null), m(4, null)],
      measurementDates: DATES,
      milestones: [],
      events: [],
      showWeights: true,
      weightTicketBalance: 0,
      activityTicketBalance: 0,
    });
    expect(b.measurements[0]?.description).toContain("基準體重");
    expect(b.measurements[0]?.ticketDelta).toBe(0);
    expect(b.measurements[0]?.changePct).toBe(0);
    expect(b.currentChangePct).toBe(0);
    expect(b.summary.weightTickets).toBe(0);
  });

  it("CASE 2: slot2 99 vs baseline 100 → -1% · +1", () => {
    const live = replayLiveWeightSequence([], 100, [99]);
    expect(live.weightTicketBalance).toBe(1);
    expect(live.weightChangePct).toBeCloseTo(-1, 10);
  });

  it("CASE 3: same-day slots 100 / 98 / 97 → tickets 3 vs baseline", () => {
    const live = replayLiveWeightSequence([], 100, [98, 97]);
    expect(computeWeightChangePct(100, 98)).toBeCloseTo(-2, 10);
    expect(computeWeightChangePct(100, 97)).toBeCloseTo(-3, 10);
    expect(live.weightTicketBalance).toBe(3);
  });

  it("CASE 5: out-of-order — slot2 before baseline waits; then baseline recomputes", () => {
    const waiting = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements: [m(1, null), m(2, 98), m(3, null), m(4, null)],
      measurementDates: DATES,
      milestones: [],
      events: [],
      showWeights: true,
      weightTicketBalance: 0,
      activityTicketBalance: 0,
    });
    expect(waiting.measurements[1]?.description).toBe("等待第1次基準體重");
    expect(waiting.measurements[1]?.ticketDelta).toBe(0);
    expect(waiting.summary.weightTickets).toBe(0);

    const noBaseline = rebuildMilestonesForCorrectedWeights([], null, [98, null, null]);
    expect(noBaseline.weightTicketBalance).toBe(0);

    const after = rebuildMilestonesForCorrectedWeights([], 100, [98, null, null]);
    expect(after.weightTicketBalance).toBe(2);
    expect(after.weightChangePct).toBeCloseTo(-2, 10);
  });

  it("CASE 6: reverse slot order 4→3→2→1 still uses slot order vs baseline", () => {
    // Weights exist for 2,3,4; baseline applied last — rebuild always walks 2→3→4
    const rebuilt = rebuildMilestonesForCorrectedWeights([], 100, [99, 98, 97]);
    expect(rebuilt.weightChangePct).toBeCloseTo(-3, 10);
    expect(rebuilt.weightTicketBalance).toBe(3);
    expect(rebuilt.milestones.map((x) => x.milestonePercent)).toEqual([1, 2, 3]);
  });

  it("CASE 7: baseline edit 100→102 recomputes all later slots", () => {
    const prior = replayLiveWeightSequence([], 100, [99, 98]);
    expect(prior.weightTicketBalance).toBe(2);

    const rebuilt = rebuildMilestonesForCorrectedWeights(
      prior.milestones.map((x) => x.milestonePercent),
      102,
      [99, 98, null],
    );
    // 99/102 ≈ -2.94% → milestones 1,2 active; 98/102 ≈ -3.92% → 1,2,3
    expect(rebuilt.weightTicketBalance).toBe(3);
    expect(computeWeightChangePct(102, 99)).toBeCloseTo(((99 - 102) / 102) * 100, 10);
  });

  it("CASE 8: mid-slot edit keeps baseline-relative state consistent", () => {
    const prior = replayLiveWeightSequence([], 100, [99, 98]);
    const rebuilt = rebuildMilestonesForCorrectedWeights(
      prior.milestones.map((x) => x.milestonePercent),
      100,
      [99.5, 98, null],
    );
    expect(computeWeightChangePct(100, 99.5)).toBeCloseTo(-0.5, 10);
    // -0.5% then -2% → active tickets for -1 and -2
    expect(rebuilt.weightTicketBalance).toBe(2);
    expect(rebuilt.weightChangePct).toBeCloseTo(-2, 10);
  });

  it("CASE 9: 100→99→101→99 never re-awards -1%", () => {
    const result = replayLiveWeightSequence([], 100, [99, 101, 99]);
    const awards = result.events.filter((e) => e.eventType === "weight_milestone_awarded");
    expect(awards).toHaveLength(1);
    expect(result.weightTicketBalance).toBe(0);
  });

  it("CASE 10: public breakdown matches staff math for same inputs", () => {
    const measurements = [m(1, 100), m(2, 99), m(3, 98), m(4, 97)];
    const staff = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements,
      measurementDates: DATES,
      milestones: [
        {
          participantId: "u",
          periodId: "p",
          milestonePercent: 1,
          ticketState: "active",
          awardedAt: "",
          revokedAt: null,
        },
        {
          participantId: "u",
          periodId: "p",
          milestonePercent: 2,
          ticketState: "active",
          awardedAt: "",
          revokedAt: null,
        },
        {
          participantId: "u",
          periodId: "p",
          milestonePercent: 3,
          ticketState: "active",
          awardedAt: "",
          revokedAt: null,
        },
      ],
      events: [],
      showWeights: true,
      weightTicketBalance: 3,
      activityTicketBalance: 0,
    });
    const publicView = buildTicketBreakdown({
      participantId: "u",
      displayName: "王*",
      measurements,
      measurementDates: DATES,
      milestones: staff.milestones.map((row) => ({
        participantId: "u",
        periodId: "p",
        milestonePercent: row.percent,
        ticketState: row.currentlyActive ? ("active" as const) : ("revoked" as const),
        awardedAt: "",
        revokedAt: row.currentlyActive ? null : "",
      })),
      events: [],
      showWeights: false,
      weightTicketBalance: 3,
      activityTicketBalance: 0,
    });

    expect(staff.measurements.map((x) => x.changePct)).toEqual(
      publicView.measurements.map((x) => x.changePct),
    );
    expect(staff.measurements.map((x) => x.ticketDelta)).toEqual(
      publicView.measurements.map((x) => x.ticketDelta),
    );
    expect(staff.summary).toEqual(publicView.summary);
    expect(publicView.baselineKg).toBeNull();
    expect(publicView.measurements.every((row) => row.weightKg == null)).toBe(true);
  });

  it("future-dated slots remain editable in staff UI (no date gate)", () => {
    const staffSrc = readFileSync(
      resolve(process.cwd(), "src/components/lose2kg/Lose2kgStaffWorkstationPage.tsx"),
      "utf8",
    );
    expect(staffSrc).toContain("四週量測欄位皆可隨時補登或修正");
    expect(staffSrc).toContain("正式進度：第 {slot} 週");
    expect(staffSrc).toContain("總抽獎券");
    expect(staffSrc).toContain("onBlur");
    expect(staffSrc).not.toMatch(/currentDate\s*</);
    expect(staffSrc).not.toMatch(/measurementDate.*disabled/i);
    // Measure inputs must not be date-disabled
    expect(staffSrc).not.toMatch(/disabled=\{[^}]*slot/);
    expect(staffSrc).toContain("measurementDates");
  });

  it("ticket-breakdown waiting copy + slot1 baseline label", () => {
    const waiting = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements: [m(1, null), m(2, 97), m(3, null), m(4, 96)],
      measurementDates: DATES,
      milestones: [],
      events: [],
      showWeights: true,
      weightTicketBalance: 0,
      activityTicketBalance: 0,
    });
    expect(waiting.measurements[1]?.description).toBe("等待第1次基準體重");
    expect(waiting.measurements[2]?.description).toBe("尚未量測");
    expect(waiting.measurements[3]?.description).toBe("等待第1次基準體重");
  });
});
