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
import { PARTNER_V2_NAV_ITEMS, PARTNER_V2_HIDDEN_LEGACY_ROUTES } from "@/lib/partner-v2/partner-navigation";
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
    nextSteps: [],
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

describe("Partner App V2 home presentation", () => {
  it("PV2-01 home leads with monthly action hero", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("MonthlyActionHero");
    expect(home).not.toContain(">我的進度<");
    expect(home).not.toContain(">今天<");
  });

  it("PV2-02 legacy business entries removed from home surface", () => {
    expect(MY_HOME_BUSINESS_ENTRIES).toHaveLength(0);
    for (const route of ["/goals", "/leaderboard", "/president-road", "/members", "/events"]) {
      expect(MY_HOME_MORE_ENTRIES.every((entry) => entry.href !== route)).toBe(true);
    }
  });

  it("PV2-03 bottom nav has four core tabs", () => {
    expect(PARTNER_V2_NAV_ITEMS).toHaveLength(4);
    expect(PARTNER_V2_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/retail-house",
      "/daily-action",
      "/organization",
    ]);
  });

  it("PV2-04 calendar remains reachable via secondary shortcuts", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("PartnerSecondaryShortcuts");
    const shortcuts = readFileSync(
      resolve(process.cwd(), "src/lib/partner-v2/partner-navigation.ts"),
      "utf8",
    );
    expect(shortcuts).toContain('"/calendar"');
  });

  it("PV2-05 hidden legacy routes list preserved for audit", () => {
    expect(PARTNER_V2_HIDDEN_LEGACY_ROUTES).toEqual(
      expect.arrayContaining(["/goals", "/leaderboard", "/president-road"]),
    );
  });

  it("MY-02 max 3 top priorities (presentation helper unchanged)", () => {
    const cards = buildHomeTodayPriorities([
      mockPriority({ title: "一" }),
      mockPriority({ title: "二" }),
      mockPriority({ title: "三" }),
      mockPriority({ title: "四" }),
    ]);
    expect(cards).toHaveLength(3);
  });

  it("MY-10 raw internal terminology not visible", () => {
    expect(humanizeHomePriorityCopy("VP Sprint")).not.toMatch(/Sprint/i);
    expect(containsInternalMyHomeTerminology("VP Sprint")).toBe(true);
  });

  it("MY-07 cross-world shortcuts not on legacy home business grid", () => {
    expect(MY_HOME_BUSINESS_ENTRIES.every((e) => !isCrossWorldHomeShortcut(e.href))).toBe(true);
    for (const href of CROSS_WORLD_HREFS) {
      expect(isCrossWorldHomeShortcut(href)).toBe(true);
    }
  });

  it("MY-12 unused MapUniverse presentation not built on home", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("includeMapUniverse: false");
  });

  it("buildHomeProgressView still labels monthly KPIs (legacy helper)", () => {
    const view = buildHomeProgressView(mockMetrics(), {
      monthlyMeasurement: { current: 8, target: 30, progressPercent: 26, isRuleMissing: false },
      monthlyConsultation: { current: 4, target: 7, progressPercent: 57, isRuleMissing: false },
    });
    expect(view.rows.some((r) => r.label === "本月量測")).toBe(true);
    expect(view.rows.some((r) => r.label === "本月諮詢")).toBe(true);
  });
});
