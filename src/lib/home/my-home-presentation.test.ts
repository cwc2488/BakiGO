import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildHomeProgressView,
  buildHomeTodayPriorities,
  containsInternalMyHomeTerminology,
  CROSS_WORLD_HREFS,
  humanizeHomePriorityCopy,
  isCrossWorldHomeShortcut,
  MY_HOME_BUSINESS_ENTRIES,
  MY_HOME_MORE_ENTRIES,
} from "@/lib/home/my-home-presentation";
import { homeMoreEntriesForViewer, ADMIN_CENTER_HOME_ENTRY } from "@/lib/auth/admin-access";
import { CUSTOMER_JOURNEY_HUB_ITEMS } from "@/lib/customers/customer-journey-hub-items";
import type { Priority } from "@/types/president-ai";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";

function mockPriority(overrides: Partial<Priority> & Pick<Priority, "title">): Priority {
  return {
    description: overrides.description ?? overrides.title,
    score: overrides.score ?? 88,
    category: overrides.category ?? "MISSION",
    expectedImpact: overrides.expectedImpact ?? 1,
    sourceKey: overrides.sourceKey ?? "member_goal_demo",
    actionHref: overrides.actionHref,
    title: overrides.title,
  };
}

function mockMetrics(
  overrides: Partial<MemberComputedMetrics> = {},
): MemberComputedMetrics {
  return {
    memberId: "m1",
    yearMonth: "2026-08",
    computedAt: "2026-08-13T00:00:00.000Z",
    retailHouse: {} as MemberComputedMetrics["retailHouse"],
    monthlyChallenge: {} as MemberComputedMetrics["monthlyChallenge"],
    vp: { memberId: "m1", yearMonth: "2026-08", totalVp: 720, byType: [] },
    map: {
      memberId: "m1",
      yearMonth: "2026-08",
      totalLines: 3,
      activeLines: 1,
      progressPercent: 33,
      lines: [],
    },
    nextSteps: [
      {
        stepKey: "map_monthly_personal_vp",
        title: "本月個人 VP",
        description: "",
        current: 720,
        target: 1000,
        remaining: 280,
        progressPercent: 72,
        priority: 1,
        rewardXP: 0,
      },
    ],
    qualificationResults: [],
    promotionProgress: {
      memberId: "m1",
      currentRankId: "member",
      currentRankName: "會員",
      nextRankId: "supervisor",
      nextRankName: "督導",
      downlineRankId: null,
      downlineRankName: null,
      current: 1,
      target: 3,
      remaining: 2,
      progressPercent: 40,
      ruleKey: null,
      description: "",
      badge: null,
      themeColor: null,
      isRuleMissing: false,
      isMaxRank: false,
      progressSource: "qualification",
      qualificationResult: null,
      computedAt: new Date("2026-08-13"),
    },
    gamification: {} as MemberComputedMetrics["gamification"],
    missions: {
      referenceDate: "2026-08-13",
    } as MemberComputedMetrics["missions"],
    ruleMissing: {} as MemberComputedMetrics["ruleMissing"],
    presidentAI: {
      topPriorities: [],
      reasoning: [],
      warnings: [],
      opportunities: [],
      focusMode: { key: "VP Sprint", label: "VP Sprint", reason: "" },
      computedAt: "2026-08-13T00:00:00.000Z",
    },
    retailWeeklyReport: {} as MemberComputedMetrics["retailWeeklyReport"],
    mapUniverse: { layoutSlotCount: 0, lines: [], isRuleMissing: false, computedAt: "" },
    eventCenter: {} as MemberComputedMetrics["eventCenter"],
    learningRecommendations: [],
    pipelinePushReminders: [],
    downlinePartnerSuggestions: [],
    ...overrides,
  };
}

describe("Partner UI precision cleanup", () => {
  it("hides entire 今天 card from home", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).not.toContain(">今天<");
    expect(home).not.toContain("先完成這 1–3 件");
    expect(home).not.toContain("開始今天");
    expect(home).not.toContain("buildHomeTodayPriorities");
  });

  it("hides promotion target but keeps monthly metrics", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("我的進度");
    expect(home).not.toContain("nextGoalLabel");
    expect(home).not.toContain("nextGoalValue");
    expect(home).not.toContain("nextGoalPercent");
    expect(home).toContain("progress.rows");
    expect(home).toContain("查看完整進度");
  });

  it("hides organization attention banner", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).not.toContain("partnerHint");
    expect(home).not.toContain("位夥伴值得關注");
  });

  it("hides only approved business entries", () => {
    const hrefs = MY_HOME_BUSINESS_ENTRIES.map((entry) => entry.href);
    expect(hrefs).toEqual(["/organization", "/retail-house", "/learning"]);
    expect(hrefs).not.toContain("/goals");
    expect(hrefs).not.toContain("/leaderboard");
  });

  it("hides only approved more entries and keeps Admin injection path", () => {
    const hrefs = MY_HOME_MORE_ENTRIES.map((entry) => entry.href);
    expect(hrefs).toEqual(["/promotions", "/pre-meeting-graphic", "/profile"]);
    expect(hrefs).not.toContain("/daily-action");
    expect(hrefs).not.toContain("/president-road");
    expect(hrefs).not.toContain("/members");
    expect(hrefs).not.toContain("/events");

    const partner = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, false);
    expect(partner.some((entry) => entry.title === "管理中心")).toBe(false);

    const admin = homeMoreEntriesForViewer(MY_HOME_MORE_ENTRIES, true);
    expect(admin).toContainEqual(ADMIN_CENTER_HOME_ENTRY);
  });

  it("restores AI Radar as active customer hub entry", () => {
    const radar = CUSTOMER_JOURNEY_HUB_ITEMS.find((item) => item.title === "AI Radar");
    expect(radar).toMatchObject({
      href: "/radar",
      title: "AI Radar",
      desc: "智慧找人",
    });
    expect(radar?.comingSoon).toBeFalsy();
    expect(radar?.locked).toBeFalsy();

    const hub = readFileSync(
      resolve(process.cwd(), "src/components/customers/CustomerJourneyHubPage.tsx"),
      "utf8",
    );
    expect(hub).not.toContain("開發中");
    expect(hub).not.toContain("border-dashed");
    expect(hub).not.toContain("comingSoon");
  });

  it("preserves bottom nav IA", () => {
    const nav = readFileSync(resolve(process.cwd(), "src/components/navigation/AppNav.tsx"), "utf8");
    expect(nav).toContain("我的｜顧客｜行事曆");
    expect(nav).toContain('href: "/customers"');
    expect(nav).toContain('href: "/calendar"');
  });
});

describe("MY home UX presentation", () => {
  it("MY-02 max 3 top priorities helper unchanged", () => {
    const cards = buildHomeTodayPriorities([
      mockPriority({ title: "一" }),
      mockPriority({ title: "二" }),
      mockPriority({ title: "三" }),
      mockPriority({ title: "四" }),
    ]);
    expect(cards).toHaveLength(3);
  });

  it("MY-05 monthly KPI labeled monthly", () => {
    const view = buildHomeProgressView(mockMetrics(), {
      monthlyMeasurement: { current: 8, target: 10, progressPercent: 80, isRuleMissing: false },
      monthlyConsultation: { current: 4, target: 10, progressPercent: 40, isRuleMissing: false },
    });
    expect(view.rows.some((r) => r.label === "本月量測")).toBe(true);
    expect(view.rows.some((r) => r.label === "本月諮詢")).toBe(true);
    expect(view.rows.some((r) => r.label === "本月 VP")).toBe(true);
  });

  it("MY-06 business shortcuts <= 5 primary entries", () => {
    expect(MY_HOME_BUSINESS_ENTRIES.length).toBeLessThanOrEqual(5);
    expect(MY_HOME_BUSINESS_ENTRIES.length).toBeGreaterThan(0);
  });

  it("MY-07 cross-world shortcuts removed from home business/more", () => {
    for (const href of CROSS_WORLD_HREFS) {
      expect(isCrossWorldHomeShortcut(href)).toBe(true);
    }
    expect(MY_HOME_BUSINESS_ENTRIES.every((e) => !isCrossWorldHomeShortcut(e.href))).toBe(true);
    expect(MY_HOME_MORE_ENTRIES.every((e) => !isCrossWorldHomeShortcut(e.href))).toBe(true);
  });

  it("MY-08 more tools remain collapsible", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("moreOpen");
    expect(home).toContain("更多");
  });

  it("MY-10 raw internal terminology not visible in helpers", () => {
    expect(humanizeHomePriorityCopy("VP Sprint")).not.toMatch(/Sprint/i);
    expect(containsInternalMyHomeTerminology("VP Sprint")).toBe(true);
  });

  it("MY-11 Leader cloud does not block first render", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("readMissionControlMetrics");
    expect(home).not.toContain("fetchCloudOrganizationData");
    expect(home).not.toContain("fetchDownlineCloudData");
  });

  it("MY-12 unused MapUniverse presentation not built", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("includeMapUniverse: false");
  });

  it("MY-14 gamification scoring unchanged on home", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).not.toContain("availablePoints");
    expect(home).not.toContain("currentStreak");
  });
});
