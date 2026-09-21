import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  computeSubmittedOnTime,
  fivePlusFiveToday,
  getBusinessWeekRange,
  getMonthRange,
  isWithinTaipeiCalendarDay,
  listISODatesInclusive,
  daysElapsedInMonthThrough,
} from "@/lib/five-plus-five/dates";
import {
  buildMyStats,
  calculateMonthOnTimeRate,
  calculateOnTimeStreak,
  resolveDayStatus,
  sumPeriod,
} from "@/lib/five-plus-five/stats";
import { resolveFivePlusFiveTargets } from "@/lib/five-plus-five/rules";
import { formatPersonalWarReport, formatOrganizationWarReport } from "@/lib/five-plus-five/copy-report";
import {
  canViewerAccessMember,
  collectDescendantsWithGeneration,
} from "@/lib/five-plus-five/org-access";
import {
  buildFivePlusFivePushCopy,
  shouldNotifyFivePlusFive,
} from "@/lib/five-plus-five/push-scheduler";
import { normalizeCount } from "@/lib/five-plus-five/service";
import type { FivePlusFiveReportRow } from "@/types/five-plus-five";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function report(
  partial: Partial<FivePlusFiveReportRow> & Pick<FivePlusFiveReportRow, "reportDate" | "memberId">,
): FivePlusFiveReportRow {
  return {
    id: partial.id ?? `id-${partial.reportDate}`,
    memberId: partial.memberId,
    reportDate: partial.reportDate,
    fishPoolCount: partial.fishPoolCount ?? 0,
    invitationFiveStepsCount: partial.invitationFiveStepsCount ?? 0,
    firstSubmittedAt: partial.firstSubmittedAt ?? "2026-09-21T10:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-09-21T10:00:00.000Z",
    submittedOnTime: partial.submittedOnTime ?? true,
    createdAt: partial.createdAt ?? "2026-09-21T10:00:00.000Z",
  };
}

function cloudMember(
  id: string,
  memberNumber: string,
  name: string,
  sponsor: string | null = null,
): CloudMember {
  return {
    id,
    memberNumber,
    name,
    email: `${id}@example.com`,
    role: "member",
    currentLevel: "new_member",
    sponsorMemberNumber: sponsor,
    avatarUrl: null,
    createdAt: "2026-01-01",
  };
}

describe("5＋5 targets (Priority 0)", () => {
  it("O/P — weekly fish=35, invitation=5, daily fish=5", () => {
    const t = resolveFivePlusFiveTargets();
    expect(t.fishPoolDaily).toBe(5);
    expect(t.fishPoolWeekly).toBe(35);
    expect(t.invitationFiveStepsWeekly).toBe(5);
  });
});

describe("5＋5 counts validation", () => {
  it("C — rejects negatives and non-integers", () => {
    expect(normalizeCount(-1)).toBeNull();
    expect(normalizeCount(1.5)).toBe(1);
    expect(normalizeCount(0)).toBe(0);
    expect(normalizeCount(5)).toBe(5);
    expect(normalizeCount("x")).toBeNull();
  });
});

describe("5＋5 Asia/Taipei boundaries", () => {
  it("V — 23:59 Taipei still same day; 00:00 next day rolls", () => {
    // 2026-09-21 23:59 Taipei = 2026-09-21 15:59 UTC
    const beforeMidnight = new Date("2026-09-21T15:59:00.000Z");
    expect(fivePlusFiveToday(beforeMidnight)).toBe("2026-09-21");
    expect(isWithinTaipeiCalendarDay("2026-09-21", beforeMidnight)).toBe(true);

    // 2026-09-22 00:00 Taipei = 2026-09-21 16:00 UTC
    const atMidnight = new Date("2026-09-21T16:00:00.000Z");
    expect(fivePlusFiveToday(atMidnight)).toBe("2026-09-22");
    expect(isWithinTaipeiCalendarDay("2026-09-21", atMidnight)).toBe(false);
  });

  it("UTC cross-day does not use toISOString slice", () => {
    const utcLooksLikeSep21 = new Date("2026-09-21T20:00:00.000Z"); // already Sep 22 Taipei
    expect(utcLooksLikeSep21.toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(fivePlusFiveToday(utcLooksLikeSep21)).toBe("2026-09-22");
  });

  it("E — first submit today → on time; F — past date → not on time", () => {
    const now = new Date("2026-09-21T10:00:00.000Z"); // 18:00 Taipei
    expect(computeSubmittedOnTime("2026-09-21", now)).toBe(true);
    expect(computeSubmittedOnTime("2026-09-20", now)).toBe(false);
  });

  it("N — week is Monday–Sunday", () => {
    // 2026-09-21 is Monday
    expect(getBusinessWeekRange("2026-09-21")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
    // Sunday
    expect(getBusinessWeekRange("2026-09-27")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
    // Sunday → Monday crosses week
    expect(getBusinessWeekRange("2026-09-28")).toEqual({
      start: "2026-09-28",
      end: "2026-10-04",
    });
  });

  it("W — month/year boundary", () => {
    expect(getMonthRange("2026-12-31")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(getMonthRange("2027-01-01")).toEqual({ start: "2027-01-01", end: "2027-01-31" });
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysElapsedInMonthThrough("2026-09-21")).toBe(21);
  });
});

describe("5＋5 streak + on-time rate", () => {
  it("I — today open without report does not zero streak", () => {
    const today = "2026-09-21";
    const now = new Date("2026-09-21T10:00:00.000Z");
    const reports = [
      report({ memberId: "m1", reportDate: "2026-09-20", submittedOnTime: true }),
      report({ memberId: "m1", reportDate: "2026-09-19", submittedOnTime: true }),
    ];
    expect(calculateOnTimeStreak(reports, today, now)).toBe(2);
  });

  it("H — backfill does not repair streak", () => {
    const today = "2026-09-21";
    const now = new Date("2026-09-21T10:00:00.000Z");
    const reports = [
      report({ memberId: "m1", reportDate: "2026-09-20", submittedOnTime: false }),
      report({ memberId: "m1", reportDate: "2026-09-19", submittedOnTime: true }),
    ];
    expect(calculateOnTimeStreak(reports, today, now)).toBe(0);
  });

  it("closed today without report → streak 0", () => {
    const today = "2026-09-21";
    // Force "closed" by using a now that is next day while asking about yesterday as today param
    const now = new Date("2026-09-21T16:00:00.000Z"); // Sep 22 Taipei
    const reports: FivePlusFiveReportRow[] = [];
    expect(calculateOnTimeStreak(reports, "2026-09-21", now)).toBe(0);
    void today;
  });

  it("month on-time rate uses elapsed calendar days through today", () => {
    const reports = [
      report({ memberId: "m1", reportDate: "2026-09-01", submittedOnTime: true }),
      report({ memberId: "m1", reportDate: "2026-09-02", submittedOnTime: true }),
    ];
    const rate = calculateMonthOnTimeRate(reports, "2026-09-21");
    expect(rate.elapsedDays).toBe(21);
    expect(rate.onTimeDays).toBe(2);
    expect(rate.percent).toBe(Math.round((2 / 21) * 100));
  });
});

describe("5＋5 aggregates + status", () => {
  it("G — late backfill counts in weekly/monthly/history", () => {
    const reports = [
      report({
        memberId: "m1",
        reportDate: "2026-09-22",
        fishPoolCount: 5,
        invitationFiveStepsCount: 2,
        submittedOnTime: false,
      }),
      report({
        memberId: "m1",
        reportDate: "2026-09-21",
        fishPoolCount: 5,
        invitationFiveStepsCount: 1,
        submittedOnTime: true,
      }),
    ];
    const week = getBusinessWeekRange("2026-09-21");
    const totals = sumPeriod(reports, week.start, week.end);
    expect(totals.fishPool).toBe(10);
    expect(totals.invitationFiveSteps).toBe(3);

    const stats = buildMyStats({
      reports,
      todayReport: reports[1],
      today: "2026-09-21",
      memberName: "嘎嘎",
      now: new Date("2026-09-21T10:00:00.000Z"),
    });
    expect(stats.history.fishPool).toBe(10);
    expect(stats.week.fishTarget).toBe(35);
    expect(stats.week.invitationTarget).toBe(5);
  });

  it("status distinguishes not yet / unmet / overdue / backfill", () => {
    const today = "2026-09-21";
    const now = new Date("2026-09-21T10:00:00.000Z");
    expect(
      resolveDayStatus({
        reportDate: today,
        report: null,
        today,
        fishDailyTarget: 5,
        now,
      }),
    ).toBe("not_yet_reported");

    expect(
      resolveDayStatus({
        reportDate: today,
        report: report({ memberId: "m1", reportDate: today, fishPoolCount: 3 }),
        today,
        fishDailyTarget: 5,
        now,
      }),
    ).toBe("reported_fish_unmet");

    expect(
      resolveDayStatus({
        reportDate: "2026-09-19",
        report: null,
        today,
        fishDailyTarget: 5,
        now,
      }),
    ).toBe("overdue_unreported");

    expect(
      resolveDayStatus({
        reportDate: "2026-09-19",
        report: report({
          memberId: "m1",
          reportDate: "2026-09-19",
          submittedOnTime: false,
        }),
        today,
        fishDailyTarget: 5,
        now,
      }),
    ).toBe("backfill");
  });
});

describe("5＋5 organization auth", () => {
  const upline = cloudMember("up", "100", "上線");
  const gen1 = cloudMember("g1", "101", "一代", "100");
  const gen2 = cloudMember("g2", "102", "二代", "101");
  const stranger = cloudMember("x", "999", "路人");
  const members = [upline, gen1, gen2, stranger];
  const relationships: CloudOrganizationRelationship[] = [
    {
      id: "r1",
      parentMemberNumber: "100",
      childMemberNumber: "101",
      createdAt: "2026-01-01",
    },
    {
      id: "r2",
      parentMemberNumber: "101",
      childMemberNumber: "102",
      createdAt: "2026-01-01",
    },
  ];

  it("J — all descendants visible to ancestor", () => {
    const desc = collectDescendantsWithGeneration(upline, members, relationships);
    expect(desc.map((d) => d.memberId).sort()).toEqual(["g1", "g2"]);
    expect(desc.find((d) => d.memberId === "g2")?.generation).toBe(2);
  });

  it("K — non-ancestor cannot access", () => {
    expect(
      canViewerAccessMember({
        viewer: stranger,
        targetMemberId: "g1",
        members,
        relationships,
      }),
    ).toBe(false);
    expect(
      canViewerAccessMember({
        viewer: upline,
        targetMemberId: "g2",
        members,
        relationships,
      }),
    ).toBe(true);
  });
});

describe("5＋5 copy report", () => {
  it("Q — personal copy format; no fake checkmark when unmet", () => {
    const stats = buildMyStats({
      reports: [
        report({
          memberId: "m1",
          reportDate: "2026-09-21",
          fishPoolCount: 3,
          invitationFiveStepsCount: 2,
        }),
      ],
      todayReport: report({
        memberId: "m1",
        reportDate: "2026-09-21",
        fishPoolCount: 3,
        invitationFiveStepsCount: 2,
      }),
      today: "2026-09-21",
      memberName: "嘎嘎",
      now: new Date("2026-09-21T10:00:00.000Z"),
    });
    const text = formatPersonalWarReport(stats);
    expect(text).toContain("【5＋5 行動回報｜嘎嘎｜9/21】");
    expect(text).toContain("🐟 今日魚池：3/5");
    expect(text).not.toContain("✅");
    expect(text).toContain("🎯 今日邀約5步驟：+2");
  });

  it("org summary does not list every name", () => {
    const text = formatOrganizationWarReport({
      todayDate: "2026-09-21",
      totalMembers: 24,
      reportedToday: 18,
      fishMetToday: 14,
      invitationMetThisWeek: 11,
      notReportedToday: 6,
      members: [],
      targets: resolveFivePlusFiveTargets(),
    });
    expect(text).toContain("【5＋5 組織戰報｜9/21】");
    expect(text).toContain("應回報：24人");
    expect(text).not.toContain("嘎嘎");
  });
});

describe("5＋5 push reminders", () => {
  it("T/U — 23:00 only unreported; reported skip", () => {
    expect(
      shouldNotifyFivePlusFive({
        slot: "23",
        hasTodayReport: false,
        fishPoolCount: 0,
        fishDailyTarget: 5,
      }),
    ).toBe(true);
    expect(
      shouldNotifyFivePlusFive({
        slot: "23",
        hasTodayReport: true,
        fishPoolCount: 1,
        fishDailyTarget: 5,
      }),
    ).toBe(false);
  });

  it("S — 20:00 skips only when fish met", () => {
    expect(
      shouldNotifyFivePlusFive({
        slot: "20",
        hasTodayReport: true,
        fishPoolCount: 5,
        fishDailyTarget: 5,
      }),
    ).toBe(false);
    expect(
      shouldNotifyFivePlusFive({
        slot: "20",
        hasTodayReport: true,
        fishPoolCount: 4,
        fishDailyTarget: 5,
      }),
    ).toBe(true);
  });

  it("copy includes progress for 20:00", () => {
    const copy = buildFivePlusFivePushCopy({
      slot: "20",
      fishPoolCount: 2,
      fishDailyTarget: 5,
      weekInvitation: 3,
      invitationWeeklyTarget: 5,
    });
    expect(copy.body).toContain("2/5");
    expect(copy.body).toContain("3/5");
  });
});

describe("5＋5 migration 085", () => {
  it("D — unique member+date, nonneg checks, RLS downline select", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/085_five_plus_five_v1.sql"),
      "utf8",
    );
    expect(sql).toContain("five_plus_five_reports_member_date_unique");
    expect(sql).toContain("fish_pool_count >= 0");
    expect(sql).toContain("invitation_five_steps_count >= 0");
    expect(sql).toContain("five_plus_five_reports_select_downline");
    expect(sql).toContain("organization_relationships");
    expect(sql).toContain("five_plus_five_reports_update_own");
    expect(sql).not.toContain("five_plus_five_reports_update_downline");
  });
});

describe("5＋5 week list helper", () => {
  it("lists inclusive dates", () => {
    expect(listISODatesInclusive("2026-09-21", "2026-09-23")).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
    ]);
  });
});
