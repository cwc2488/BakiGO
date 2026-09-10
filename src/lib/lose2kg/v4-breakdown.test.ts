import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildTicketBreakdown,
  validateExtraTicketReason,
} from "@/lib/lose2kg/ticket-breakdown";
import type { Lose2kgMeasurement, Lose2kgTicketEvent } from "@/types/lose2kg";

function m(slot: 1|2|3|4, weightKg: number | null): Lose2kgMeasurement {
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

describe("lose2kg V4 ticket breakdown", () => {
  it("CASE 1: 100→99 awards -1 once", () => {
    const b = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements: [m(1, 100), m(2, 99), m(3, null), m(4, null)],
      measurementDates: ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"],
      milestones: [{ participantId: "u", periodId: "p", milestonePercent: 1, ticketState: "active", awardedAt: "", revokedAt: null }],
      events: [],
      showWeights: true,
      weightTicketBalance: 1,
      activityTicketBalance: 0,
    });
    expect(b.measurements[1]?.ticketDelta).toBe(1);
    expect(b.measurements[1]?.description).toContain("首次達成 -1%");
    expect(b.summary.totalTickets).toBe(1);
  });

  it("CASE 2: 100→98 crosses two milestones", () => {
    const b = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements: [m(1, 100), m(2, 98), m(3, null), m(4, null)],
      measurementDates: ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"],
      milestones: [
        { participantId: "u", periodId: "p", milestonePercent: 1, ticketState: "active", awardedAt: "", revokedAt: null },
        { participantId: "u", periodId: "p", milestonePercent: 2, ticketState: "active", awardedAt: "", revokedAt: null },
      ],
      events: [],
      showWeights: true,
      weightTicketBalance: 2,
      activityTicketBalance: 0,
    });
    expect(b.measurements[1]?.ticketDelta).toBe(2);
    expect(b.measurements[1]?.description).toContain("-1%");
    expect(b.measurements[1]?.description).toContain("-2%");
  });

  it("CASE 3: rebound shows ever-achieved but inactive", () => {
    const b = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements: [m(1, 100), m(2, 98), m(3, 99.5), m(4, null)],
      measurementDates: ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"],
      milestones: [
        { participantId: "u", periodId: "p", milestonePercent: 1, ticketState: "revoked", awardedAt: "", revokedAt: "" },
        { participantId: "u", periodId: "p", milestonePercent: 2, ticketState: "revoked", awardedAt: "", revokedAt: "" },
      ],
      events: [],
      showWeights: true,
      weightTicketBalance: 0,
      activityTicketBalance: 0,
    });
    expect(b.summary.weightTickets).toBe(0);
    expect(b.milestones.every((x) => x.everAchieved)).toBe(true);
    expect(b.milestones.every((x) => !x.currentlyActive)).toBe(true);
    expect(b.measurements[2]?.ticketDelta).toBeLessThan(0);
  });

  it("CASE 5+6: extra tickets require reason ≥2 chars; legacy blank becomes fallback", () => {
    expect(() => validateExtraTicketReason(" ")).toThrow();
    expect(() => validateExtraTicketReason("a")).toThrow();
    expect(validateExtraTicketReason("參加營養講座")).toBe("參加營養講座");

    const events: Lose2kgTicketEvent[] = [
      {
        id: "e1",
        periodId: "p",
        participantId: "u",
        eventType: "manual_add",
        delta: 2,
        reason: "參加營養講座",
        relatedMeasurementId: null,
        relatedMilestone: null,
        createdByMemberId: null,
        createdAt: "2026-09-10T11:32:00.000Z",
      },
      {
        id: "e2",
        periodId: "p",
        participantId: "u",
        eventType: "manual_add",
        delta: 1,
        reason: null,
        relatedMeasurementId: null,
        relatedMilestone: null,
        createdByMemberId: null,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    const b = buildTicketBreakdown({
      participantId: "u",
      displayName: "王小明",
      measurements: [m(1, 100)],
      measurementDates: ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01"],
      milestones: [],
      events,
      showWeights: false,
      weightTicketBalance: 0,
      activityTicketBalance: 3,
    });
    expect(b.baselineKg).toBeNull();
    expect(b.extraTickets[0]?.description).toBe("舊版額外票紀錄");
    expect(b.extraTickets[1]?.description).toBe("參加營養講座");
    expect(b.summary.totalTickets).toBe(3);
  });
});

describe("lose2kg V4 draw UI removed", () => {
  it("staff workstation has no draw tab / overlay", () => {
    const page = readFileSync(resolve(process.cwd(), "src/components/lose2kg/Lose2kgStaffWorkstationPage.tsx"), "utf8");
    expect(page).not.toContain("DrawRevealOverlay");
    expect(page).not.toContain("draw-bootstrap");
    expect(page).not.toContain('id: "draw"');
    expect(page).toContain("體重票");
    expect(page).toContain("額外票");
    expect(page).toContain("ticket-breakdown");
  });

  it("admin period page hides prize management", () => {
    const page = readFileSync(resolve(process.cwd(), "src/components/lose2kg/Lose2kgPeriodPage.tsx"), "utf8");
    expect(page).not.toContain("新增獎項");
    expect(page).not.toContain("createLose2kgPrize");
  });

  it("live dashboard has no winners / draw status UI", () => {
    const page = readFileSync(resolve(process.cwd(), "src/components/lose2kg/Lose2kgLiveDashboardPage.tsx"), "utf8");
    expect(page).not.toContain("winners");
    expect(page).not.toContain("liveDrawStatus");
    expect(page).toContain("ticket-breakdown");
    expect(page).toContain("查看明細");
  });
});
