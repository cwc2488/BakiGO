import { describe, expect, it } from "vitest";
import {
  assessCoachingNonReporting,
  compareCommandCenterCardsByRank,
} from "@/lib/coaching/attention/assess-coach-attention";
import {
  assembleCommandCenter,
  filterCommandCenterCards,
  searchCommandCenterCards,
} from "@/lib/coaching/attention/assemble-command-center";
import {
  buildDenseSubmissionCalendar,
  countConsecutiveMissingCompletedDays,
} from "@/lib/coaching/attention/build-dense-submission-calendar";
import { buildCommandCenter30Fixture } from "@/lib/coaching/attention/command-center-fixtures";
import { COACHING_NON_REPORTING_POLICY } from "@/lib/coaching/attention/coach-attention-policy";

const emptyRolling = {
  windowDays: 14,
  aggregates: {
    windowDays: 14,
    daysWithReport: 10,
    daysSubmitted: 10,
    mealReportRate: 1,
    breakfastCompletionRate: 1,
    lunchCompletionRate: 1,
    dinnerCompletionRate: 1,
    averageWaterMl: 4000,
    averageSleepDurationMinutes: 420,
    lateSleepDays: 0,
    exerciseDays: 5,
    bowelMovementSummary: { daysReported: 8, totalCount: 8, averagePerDay: 1 },
  },
  recentDays: [],
  recurringPatterns: [] as string[],
};

describe("Phase 3b Command Center", () => {
  describe("CC-M Dense Missing Calendar", () => {
    it("counts 3 consecutive missing completed days across gaps without log rows", () => {
      const asOf = "2026-08-12";
      const calendar = buildDenseSubmissionCalendar({
        asOfLogDate: asOf,
        windowDays: 14,
        logs: [
          { logDate: "2026-08-12", submitted: true },
          // 8/11, 8/10, 8/09 missing (no rows)
          { logDate: "2026-08-08", submitted: true },
        ],
      });
      expect(calendar.find((day) => day.logDate === "2026-08-11")?.submitted).toBe(false);
      expect(calendar.find((day) => day.logDate === "2026-08-10")?.submitted).toBe(false);
      expect(calendar.find((day) => day.logDate === "2026-08-09")?.submitted).toBe(false);

      const consecutive = countConsecutiveMissingCompletedDays({
        asOfLogDate: asOf,
        asOfHourTaipei: 15,
        calendar,
      });
      expect(consecutive).toBe(3);

      const assessed = assessCoachingNonReporting({
        asOfLogDate: asOf,
        asOfHourTaipei: 15,
        submissionCalendar: calendar,
        rollingMemory: emptyRolling,
      });
      expect(assessed.consecutiveMissedCompletedDays).toBe(3);
      expect(assessed.status).toBe("short_gap");
    });
  });

  describe("CC-N Today Before Grace", () => {
    it("18:00 without submit does not escalate missing streak", () => {
      const asOf = "2026-08-12";
      const calendar = buildDenseSubmissionCalendar({
        asOfLogDate: asOf,
        logs: [
          { logDate: "2026-08-12", submitted: false },
          { logDate: "2026-08-11", submitted: true },
        ],
      });
      const consecutive = countConsecutiveMissingCompletedDays({
        asOfLogDate: asOf,
        asOfHourTaipei: 18,
        calendar,
      });
      expect(consecutive).toBe(0);
      const assessed = assessCoachingNonReporting({
        asOfLogDate: asOf,
        asOfHourTaipei: 18,
        submissionCalendar: calendar,
        rollingMemory: emptyRolling,
      });
      expect(assessed.status).toBe("today_not_yet");
      expect(assessed.reasonCode).toBe("today_not_yet_reported");
    });
  });

  describe("CC-O Today After Grace", () => {
    it("21:00 without submit includes today in consecutive missing", () => {
      const asOf = "2026-08-12";
      const calendar = buildDenseSubmissionCalendar({
        asOfLogDate: asOf,
        logs: [
          { logDate: "2026-08-12", submitted: false },
          { logDate: "2026-08-11", submitted: false },
          { logDate: "2026-08-10", submitted: true },
        ],
      });
      expect(COACHING_NON_REPORTING_POLICY.todayGraceHourTaipei).toBe(20);
      const consecutive = countConsecutiveMissingCompletedDays({
        asOfLogDate: asOf,
        asOfHourTaipei: 21,
        calendar,
      });
      expect(consecutive).toBe(2);
      const assessed = assessCoachingNonReporting({
        asOfLogDate: asOf,
        asOfHourTaipei: 21,
        submissionCalendar: calendar,
        rollingMemory: emptyRolling,
      });
      expect(assessed.consecutiveMissedCompletedDays).toBe(2);
      expect(assessed.status).toBe("short_gap");
    });
  });

  describe("CC-P Ranking", () => {
    it("5-day missing ranks before 2-day missing within watch", () => {
      const asOf = "2026-08-12";
      const owner = "owner-a";
      const fixture = buildCommandCenter30Fixture({ asOfLogDate: asOf, ownerMemberId: owner });
      const result = assembleCommandCenter({
        ownerMemberId: owner,
        asOfLogDate: asOf,
        asOfHourTaipei: 21,
        customers: fixture,
      });
      const watch = result.sections.watch;
      expect(watch.length).toBeGreaterThanOrEqual(2);
      const fiveDay = watch.find((card) => card.customerDisplayName.startsWith("觀察五天"));
      const twoDay = watch.find((card) => card.customerDisplayName.startsWith("觀察兩天"));
      expect(fiveDay).toBeTruthy();
      expect(twoDay).toBeTruthy();
      expect(fiveDay!.assessment.tier).toBe("watch");
      expect(twoDay!.assessment.tier).toBe("watch");
      expect(fiveDay!.assessment.consecutiveMissedCompletedDays).toBeGreaterThan(
        twoDay!.assessment.consecutiveMissedCompletedDays,
      );
      expect(compareCommandCenterCardsByRank(fiveDay!, twoDay!)).toBeLessThan(0);
      const fiveIndex = watch.findIndex((card) => card.enrollmentId === fiveDay!.enrollmentId);
      const twoIndex = watch.findIndex((card) => card.enrollmentId === twoDay!.enrollmentId);
      expect(fiveIndex).toBeLessThan(twoIndex);
    });
  });

  describe("CC-Q Attention Empty", () => {
    it("does not invent needs_attention when all customers are routine/positive", () => {
      const asOf = "2026-08-12";
      const owner = "owner-a";
      const fixture = buildCommandCenter30Fixture({ asOfLogDate: asOf, ownerMemberId: owner })
        .filter((item) => item.enrollment.ownerMemberId === owner)
        .map((item) => ({
          ...item,
          // Force healthy submissions and fresh measurement
          logs: item.logs.map((log) => ({
            ...log,
            submittedAt: `${log.logDate}T10:00:00.000Z`,
            sleepBedtime: "22:30",
          })),
          bodyRecords: item.bodyRecords.map((record, index) =>
            index === 0 ? { ...record, recordDate: "2026-08-10" } : record,
          ),
        }));

      // Keep only first 30 owned, all fully submitted
      const healthy = fixture.slice(0, 30);
      const result = assembleCommandCenter({
        ownerMemberId: owner,
        asOfLogDate: asOf,
        asOfHourTaipei: 15,
        customers: healthy,
      });
      expect(result.sections.needsAttention).toEqual([]);
      expect(result.counts.needsAttention).toBe(0);
      expect(result.meta.openaiCalled).toBe(false);
    });
  });

  describe("CC-R Permission", () => {
    it("batch assemble only includes authorized owner customers", () => {
      const asOf = "2026-08-12";
      const fixture = buildCommandCenter30Fixture({
        asOfLogDate: asOf,
        ownerMemberId: "owner-a",
        otherOwnerMemberId: "owner-b",
      });
      expect(fixture.some((item) => item.enrollment.ownerMemberId === "owner-b")).toBe(true);
      const result = assembleCommandCenter({
        ownerMemberId: "owner-a",
        asOfLogDate: asOf,
        asOfHourTaipei: 21,
        customers: fixture,
      });
      expect(result.sections.allActive.every((card) => !card.customerDisplayName.includes("未授權"))).toBe(
        true,
      );
      expect(result.sections.allActive.some((card) => card.enrollmentId === "other-owner")).toBe(false);
      expect(result.counts.total).toBe(30);
    });
  });

  describe("search / filters / UX fixture mix", () => {
    it("30-customer fixture surfaces mixed sections for 30-second scan", () => {
      const asOf = "2026-08-12";
      const result = assembleCommandCenter({
        ownerMemberId: "owner-a",
        asOfLogDate: asOf,
        asOfHourTaipei: 21,
        customers: buildCommandCenter30Fixture({ asOfLogDate: asOf }),
      });
      expect(result.counts.total).toBe(30);
      expect(result.counts.needsAttention).toBeGreaterThanOrEqual(2);
      expect(result.counts.watch).toBeGreaterThanOrEqual(4);
      expect(result.counts.measurementDue).toBeGreaterThanOrEqual(3);
      expect(result.sections.needsAttention[0]?.assessment.primaryReason).toBeTruthy();
      expect(result.meta.openaiCalled).toBe(false);

      const searched = searchCommandCenterCards(result.sections.allActive, "需要處理");
      expect(searched.length).toBeGreaterThan(0);
      expect(searched.every((card) => card.customerDisplayName.includes("需要處理"))).toBe(true);

      const phoneSearch = searchCommandCenterCards(result.sections.allActive, "0000");
      expect(phoneSearch.length).toBeGreaterThan(0);

      const filtered = filterCommandCenterCards(result.sections.allActive, "needs_attention");
      expect(filtered.every((card) => card.assessment.commandCenterSection === "needs_attention")).toBe(
        true,
      );
    });

    it("shows empty search result clearly when nothing matches", () => {
      const result = assembleCommandCenter({
        ownerMemberId: "owner-a",
        asOfLogDate: "2026-08-12",
        asOfHourTaipei: 15,
        customers: buildCommandCenter30Fixture(),
      });
      expect(searchCommandCenterCards(result.sections.allActive, "zzz-no-match")).toEqual([]);
    });
  });
});
