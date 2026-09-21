import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  computeSubmittedOnTime,
  fivePlusFiveToday,
  getBusinessWeekRange,
  getMonthRange,
  isValidISOCalendarDate,
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
import { processDueMembersWithQuota } from "@/lib/five-plus-five/push-batch";
import {
  buildFivePlusFivePushCopy,
  FIVE_PLUS_FIVE_DEFAULT_CLAIM_LIMIT,
  FIVE_PLUS_FIVE_MAX_CLAIM_LIMIT,
  FIVE_PLUS_FIVE_SEND_CONCURRENCY,
  shouldNotifyFivePlusFive,
} from "@/lib/five-plus-five/push-scheduler";
import { collectActivePushMemberIds } from "@/lib/push/active-push-members";
import {
  DEFAULT_CALENDAR_PUSH_LIMIT,
  DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT,
  MAX_CALENDAR_PUSH_LIMIT,
  resolvePushWorkerLimits,
} from "@/lib/push/push-worker-limits";
import {
  buildMyStatsFromAggregates,
  mapReportRow,
  normalizeCount,
  STATS_FETCH_STRATEGY,
} from "@/lib/five-plus-five/service";
import type { FivePlusFiveReportRow } from "@/types/five-plus-five";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function report(
  partial: Partial<FivePlusFiveReportRow> & Pick<FivePlusFiveReportRow, "reportDate" | "memberId">,
): FivePlusFiveReportRow {
  const fish = partial.fishPoolCount ?? 0;
  const invite = partial.invitationFiveStepsCount ?? 0;
  return {
    id: partial.id ?? `id-${partial.reportDate}`,
    memberId: partial.memberId,
    reportDate: partial.reportDate,
    fishPoolCount: fish,
    invitationFiveStepsCount: invite,
    manualFishPoolCount: partial.manualFishPoolCount ?? fish,
    questionnaireFishPoolCount: partial.questionnaireFishPoolCount ?? 0,
    manualInvitationFiveStepsCount: partial.manualInvitationFiveStepsCount ?? invite,
    questionnaireInvitationFiveStepsCount: partial.questionnaireInvitationFiveStepsCount ?? 0,
    hasUserSubmitted: partial.hasUserSubmitted ?? true,
    userSubmittedAt: partial.userSubmittedAt ?? partial.firstSubmittedAt ?? "2026-09-21T10:00:00.000Z",
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
  it("rejects decimals / negatives — no silent floor", () => {
    expect(normalizeCount(1.5)).toBeNull();
    expect(normalizeCount(1.01)).toBeNull();
    expect(normalizeCount(-1)).toBeNull();
    expect(normalizeCount(5)).toBe(5);
    expect(normalizeCount(0)).toBe(0);
    expect(normalizeCount(Number.NaN)).toBeNull();
    expect(normalizeCount("x")).toBeNull();
  });
});

describe("5＋5 ISO calendar date validation", () => {
  it("rejects invalid calendar dates", () => {
    expect(isValidISOCalendarDate("2026-00-00")).toBe(false);
    expect(isValidISOCalendarDate("2026-02-31")).toBe(false);
    expect(isValidISOCalendarDate("2026-99-99")).toBe(false);
    expect(isValidISOCalendarDate("2026-09-21")).toBe(true);
    expect(isValidISOCalendarDate("2024-02-29")).toBe(true);
    expect(isValidISOCalendarDate("2025-02-29")).toBe(false);
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

  it("GET cron defaults: 5＋5=1000, calendar=80; concurrency bounded", () => {
    expect(FIVE_PLUS_FIVE_DEFAULT_CLAIM_LIMIT).toBe(1000);
    expect(FIVE_PLUS_FIVE_MAX_CLAIM_LIMIT).toBe(1000);
    expect(FIVE_PLUS_FIVE_SEND_CONCURRENCY).toBeGreaterThanOrEqual(20);
    expect(FIVE_PLUS_FIVE_SEND_CONCURRENCY).toBeLessThanOrEqual(25);
    expect(DEFAULT_FIVE_PLUS_FIVE_PUSH_LIMIT).toBe(1000);
    expect(DEFAULT_CALENDAR_PUSH_LIMIT).toBe(80);
    expect(MAX_CALENDAR_PUSH_LIMIT).toBe(200);

    const getLimits = resolvePushWorkerLimits({ method: "GET" });
    expect(getLimits.calendarLimit).toBe(80);
    expect(getLimits.fivePlusFiveLimit).toBe(1000);

    const postLimits = resolvePushWorkerLimits({ method: "POST", bodyLimit: 1000 });
    expect(postLimits.calendarLimit).toBe(200); // capped — calendar unchanged
    expect(postLimits.fivePlusFiveLimit).toBe(1000);
  });

  it("Scenario A — 1000 due members with GET default config in one invocation", async () => {
    const due = Array.from({ length: 1000 }, (_, i) => `m-${i}`);
    const claimed = new Set<string>();

    const result = await processDueMembersWithQuota({
      dueMemberIds: due,
      limit: FIVE_PLUS_FIVE_DEFAULT_CLAIM_LIMIT,
      concurrency: FIVE_PLUS_FIVE_SEND_CONCURRENCY,
      tryClaimAndSend: async (memberId) => {
        if (claimed.has(memberId)) return "already_claimed";
        claimed.add(memberId);
        return "sent";
      },
    });

    expect(result.newlyClaimed).toBe(1000);
    expect(result.sent).toBe(1000);
    expect(result.newlyClaimed).not.toBe(80);
    expect(claimed.size).toBe(1000);
  });

  it("Scenario B — 1200 due: first 1000, second run processes remaining 200", async () => {
    const due = Array.from({ length: 1200 }, (_, i) => `m-${i}`);
    const claimed = new Set<string>();

    const run = () =>
      processDueMembersWithQuota({
        dueMemberIds: due,
        limit: FIVE_PLUS_FIVE_DEFAULT_CLAIM_LIMIT,
        concurrency: FIVE_PLUS_FIVE_SEND_CONCURRENCY,
        tryClaimAndSend: async (memberId) => {
          if (claimed.has(memberId)) return "already_claimed";
          claimed.add(memberId);
          return "sent";
        },
      });

    const first = await run();
    expect(first.newlyClaimed).toBe(1000);
    expect(claimed.size).toBe(1000);

    const second = await run();
    expect(second.alreadyClaimed).toBe(1000);
    expect(second.newlyClaimed).toBe(200);
    expect(second.sent).toBe(200);
    expect(claimed.size).toBe(1200);
  });

  it("Scenario C — calendar limit stays safe and independent of 5＋5 1000", () => {
    const getLimits = resolvePushWorkerLimits({ method: "GET" });
    expect(getLimits.calendarLimit).toBe(80);
    expect(getLimits.fivePlusFiveLimit).toBe(1000);

    const postHigh = resolvePushWorkerLimits({ method: "POST", bodyLimit: 5000 });
    expect(postHigh.calendarLimit).toBe(200);
    expect(postHigh.fivePlusFiveLimit).toBe(1000);

    const postLow = resolvePushWorkerLimits({ method: "POST", bodyLimit: 50 });
    expect(postLow.calendarLimit).toBe(50);
    expect(postLow.fivePlusFiveLimit).toBe(50);
  });

  it("Scenario D — pagination over 1300 subscription rows with duplicate member IDs", async () => {
    // 1300 rows, page size 1000 → 2 pages. Many duplicate member_ids.
    const rows: Array<{ member_id: string }> = [];
    for (let i = 0; i < 1300; i += 1) {
      // 650 unique members, each appears twice across the stream
      rows.push({ member_id: `member-${i % 650}` });
    }

    const pageCalls: Array<{ from: number; to: number }> = [];
    const ids = await collectActivePushMemberIds({
      pageSize: 1000,
      fetchPage: async (from, to) => {
        pageCalls.push({ from, to });
        return rows.slice(from, to + 1);
      },
    });

    expect(pageCalls.length).toBe(2);
    expect(pageCalls[0]).toEqual({ from: 0, to: 999 });
    expect(pageCalls[1]).toEqual({ from: 1000, to: 1999 });
    expect(ids.length).toBe(650);
    expect(ids).toContain("member-0");
    expect(ids).toContain("member-649");
  });

  it("already_claimed does not consume claim quota within one run", async () => {
    const due = Array.from({ length: 50 }, (_, i) => `m-${i}`);
    const preClaimed = new Set(due.slice(0, 30));
    const newly = new Set<string>();

    const result = await processDueMembersWithQuota({
      dueMemberIds: due,
      limit: 10,
      concurrency: 5,
      tryClaimAndSend: async (memberId) => {
        if (preClaimed.has(memberId)) return "already_claimed";
        newly.add(memberId);
        return "sent";
      },
    });

    expect(result.alreadyClaimed).toBe(30);
    expect(result.newlyClaimed).toBe(10);
    expect(result.sent).toBe(10);
    expect(newly.size).toBe(10);
  });
});

describe("5＋5 migration 085 privileges + RPC", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/085_five_plus_five_v1.sql"),
    "utf8",
  );

  it("D — unique member+date, nonneg checks, RLS downline select", () => {
    expect(sql).toContain("five_plus_five_reports_member_date_unique");
    expect(sql).toContain("fish_pool_count >= 0");
    expect(sql).toContain("invitation_five_steps_count >= 0");
    expect(sql).toContain("five_plus_five_reports_select_downline");
    expect(sql).toContain("organization_relationships");
    expect(sql).not.toContain("five_plus_five_reports_update_downline");
  });

  it("authenticated cannot mutate; anon revoked; service_role mutates", () => {
    expect(sql).toMatch(/grant select on table public\.five_plus_five_reports to authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.five_plus_five_reports from authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.five_plus_five_reports from anon/i);
    expect(sql).toMatch(/grant all on table public\.five_plus_five_reports to service_role/i);
    expect(sql).not.toMatch(/grant insert.*authenticated/i);
    expect(sql).not.toMatch(/grant update.*authenticated/i);
    expect(sql).not.toMatch(/grant delete.*authenticated/i);
    // Mutation policies dropped / not present for authenticated writes
    expect(sql).toContain('drop policy if exists "five_plus_five_reports_insert_own"');
    expect(sql).toContain('drop policy if exists "five_plus_five_reports_update_own"');
  });

  it("aggregate RPC is service_role only (no PUBLIC/anon/authenticated execute)", () => {
    expect(sql).toContain("get_five_plus_five_member_stats");
    expect(sql).toContain("security definer");
    expect(sql).toMatch(
      /revoke all on function public\.get_five_plus_five_member_stats[\s\S]*from public/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.get_five_plus_five_member_stats[\s\S]*from anon/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.get_five_plus_five_member_stats[\s\S]*from authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.get_five_plus_five_member_stats[\s\S]*to service_role/i,
    );
  });
});

describe("5＋5 migration 086 questionnaire components + has_user_submitted", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/086_questionnaire_development_v1.sql"),
    "utf8",
  );

  it("splits manual vs questionnaire counts; backfills existing as manual", () => {
    expect(sql).toContain("manual_fish_pool_count");
    expect(sql).toContain("questionnaire_fish_pool_count");
    expect(sql).toContain("manual_invitation_five_steps_count");
    expect(sql).toContain("questionnaire_invitation_five_steps_count");
    expect(sql).toContain("has_user_submitted");
    expect(sql).toContain("user_submitted_at");
    expect(sql).toContain("manual_fish_pool_count = coalesce(manual_fish_pool_count, fish_pool_count)");
    expect(sql).toContain(
      "manual_invitation_five_steps_count = coalesce(manual_invitation_five_steps_count, invitation_five_steps_count)",
    );
  });

  it("RPC credits preserve has_user_submitted=false for auto-only rows", () => {
    expect(sql).toContain("_five_plus_five_credit_questionnaire_fish");
    expect(sql).toContain("has_user_submitted");
    expect(sql).toMatch(/has_user_submitted,\s*[\s\S]*false/i);
    expect(sql).toContain("revoke all on function public._five_plus_five_credit_questionnaire_fish");
    expect(sql).toContain("start_questionnaire_lead_invitation_v1");
  });

  it("stats RPC on-time/streak require has_user_submitted", () => {
    expect(sql).toContain("case when has_user_submitted and submitted_on_time then 1 else 0 end");
    expect(sql).toContain("v_has_user_today");
  });
});

describe("5＋5 questionnaire auto-credit does not fake 已回報", () => {
  it("questionnaire-only row → not_yet_reported; totals still visible", () => {
    const autoOnly = report({
      memberId: "m1",
      reportDate: "2026-09-21",
      fishPoolCount: 1,
      manualFishPoolCount: 0,
      questionnaireFishPoolCount: 1,
      invitationFiveStepsCount: 0,
      hasUserSubmitted: false,
      userSubmittedAt: null,
      submittedOnTime: false,
    });
    expect(
      resolveDayStatus({
        reportDate: "2026-09-21",
        report: autoOnly,
        today: "2026-09-21",
        fishDailyTarget: 5,
        now: new Date("2026-09-21T10:00:00.000Z"),
      }),
    ).toBe("not_yet_reported");

    const stats = buildMyStatsFromAggregates({
      todayReport: autoOnly,
      week: { fishPool: 1, invitationFiveSteps: 0 },
      month: { fishPool: 1, invitationFiveSteps: 0 },
      history: { fishPool: 1, invitationFiveSteps: 0 },
      streakOnTimeDays: 0,
      monthOnTimeDays: 0,
      today: "2026-09-21",
      memberName: "測試",
      now: new Date("2026-09-21T10:00:00.000Z"),
    });
    expect(stats.today.hasReport).toBe(false);
    expect(stats.today.fishPool).toBe(1);
    expect(stats.today.questionnaireFishPool).toBe(1);
    expect(stats.today.manualFishPool).toBe(0);
    expect(stats.today.status).toBe("not_yet_reported");
  });

  it("streak ignores questionnaire-only auto row for today", () => {
    const streak = calculateOnTimeStreak(
      [
        report({
          memberId: "m1",
          reportDate: "2026-09-20",
          submittedOnTime: true,
          hasUserSubmitted: true,
        }),
        report({
          memberId: "m1",
          reportDate: "2026-09-21",
          fishPoolCount: 1,
          questionnaireFishPoolCount: 1,
          hasUserSubmitted: false,
          submittedOnTime: false,
        }),
      ],
      "2026-09-21",
      new Date("2026-09-21T10:00:00.000Z"),
    );
    expect(streak).toBe(1);
  });

  it("mapReportRow defaults pre-086 rows as fully manual + user submitted", () => {
    const mapped = mapReportRow({
      id: "r1",
      member_id: "m1",
      report_date: "2026-09-20",
      fish_pool_count: 5,
      invitation_five_steps_count: 2,
      first_submitted_at: "2026-09-20T01:00:00.000Z",
      updated_at: "2026-09-20T01:00:00.000Z",
      submitted_on_time: true,
      created_at: "2026-09-20T01:00:00.000Z",
    });
    expect(mapped.manualFishPoolCount).toBe(5);
    expect(mapped.questionnaireFishPoolCount).toBe(0);
    expect(mapped.manualInvitationFiveStepsCount).toBe(2);
    expect(mapped.questionnaireInvitationFiveStepsCount).toBe(0);
    expect(mapped.hasUserSubmitted).toBe(true);
  });
});

describe("5＋5 stats aggregation (no full-history fetch)", () => {
  it("uses RPC aggregate strategy constant", () => {
    expect(STATS_FETCH_STRATEGY).toBe("rpc_aggregate_get_five_plus_five_member_stats");
  });

  it("buildMyStatsFromAggregates preserves history/streak/month on-time", () => {
    const stats = buildMyStatsFromAggregates({
      todayReport: report({
        memberId: "m1",
        reportDate: "2026-09-21",
        fishPoolCount: 5,
        invitationFiveStepsCount: 1,
        submittedOnTime: true,
      }),
      week: { fishPool: 24, invitationFiveSteps: 4 },
      month: { fishPool: 87, invitationFiveSteps: 16 },
      history: { fishPool: 1284, invitationFiveSteps: 186 },
      streakOnTimeDays: 12,
      monthOnTimeDays: 18,
      today: "2026-09-21",
      memberName: "嘎嘎",
      now: new Date("2026-09-21T10:00:00.000Z"),
    });
    expect(stats.history.fishPool).toBe(1284);
    expect(stats.streakOnTimeDays).toBe(12);
    expect(stats.monthElapsedDays).toBe(21);
    expect(stats.monthOnTimeRatePercent).toBe(Math.round((18 / 21) * 100));
    expect(stats.week.fishTarget).toBe(35);
    expect(stats.week.invitationTarget).toBe(5);
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
