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

describe("MY home UX presentation", () => {
  it("MY-01 Today appears before progress", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    const todayIdx = home.indexOf("SectionLabel icon={APP_ICON.section.presidentAi}>今天");
    const progressIdx = home.indexOf(">我的進度<");
    expect(todayIdx).toBeGreaterThan(-1);
    expect(progressIdx).toBeGreaterThan(todayIdx);
  });

  it("MY-02 max 3 top priorities", () => {
    const cards = buildHomeTodayPriorities([
      mockPriority({ title: "一" }),
      mockPriority({ title: "二" }),
      mockPriority({ title: "三" }),
      mockPriority({ title: "四" }),
    ]);
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.title)).toEqual(["一", "二", "三"]);
  });

  it("MY-03 no score percentage", () => {
    const cards = buildHomeTodayPriorities([
      mockPriority({ title: "關心名單", score: 91 }),
    ]);
    expect(JSON.stringify(cards)).not.toMatch(/91|score/i);
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).not.toMatch(/priority\.score/);
    expect(home).not.toMatch(/score\}%/);
  });

  it("MY-04 no fake daily completion aggregate", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).not.toContain("今日完成度");
    expect(home).not.toMatch(/overallPercent/);
    expect(home).not.toMatch(/completionCandidates/);
  });

  it("MY-05 monthly KPI labeled monthly", () => {
    const view = buildHomeProgressView(mockMetrics(), {
      monthlyMeasurement: { current: 8, target: 10, progressPercent: 80, isRuleMissing: false },
      monthlyConsultation: { current: 4, target: 10, progressPercent: 40, isRuleMissing: false },
    });
    expect(view.rows.some((r) => r.label === "本月量測")).toBe(true);
    expect(view.rows.some((r) => r.label === "本月諮詢")).toBe(true);
    expect(view.rows.some((r) => r.label === "本月 VP")).toBe(true);
    expect(view.rows.every((r) => !r.label.includes("今日"))).toBe(true);
  });

  it("MY-06 business shortcuts <= 5 primary entries", () => {
    expect(MY_HOME_BUSINESS_ENTRIES.length).toBeLessThanOrEqual(5);
    expect(MY_HOME_BUSINESS_ENTRIES.length).toBeGreaterThan(0);
  });

  it("MY-07 cross-world shortcuts removed", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    for (const href of CROSS_WORLD_HREFS) {
      expect(home).not.toContain(`href="${href}"`);
      expect(isCrossWorldHomeShortcut(href)).toBe(true);
    }
    expect(MY_HOME_BUSINESS_ENTRIES.every((e) => !isCrossWorldHomeShortcut(e.href))).toBe(true);
    expect(MY_HOME_MORE_ENTRIES.every((e) => !isCrossWorldHomeShortcut(e.href))).toBe(true);
  });

  it("MY-08 low-frequency tools collapsed/moved", () => {
    const moreHrefs = MY_HOME_MORE_ENTRIES.map((e) => e.href);
    expect(moreHrefs).toEqual(
      expect.arrayContaining([
        "/profile",
        "/promotions",
        "/events",
        "/pre-meeting-graphic",
      ]),
    );
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("moreOpen");
    expect(home).toContain("更多");
  });

  it("MY-09 daily-action CTA preserved", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain('href="/daily-action"');
    expect(home).toMatch(/開始今天|查看今日行動/);
    expect(home).toContain("可以查看今日行動，安排接下來要完成的事情。");
    expect(home).not.toContain("顧客／行事曆");
    expect(home).not.toContain("去顧客");
    expect(home).not.toContain("去行事曆");
  });

  it("MY-10 raw internal terminology not visible", () => {
    expect(humanizeHomePriorityCopy("VP Sprint")).not.toMatch(/Sprint/i);
    expect(containsInternalMyHomeTerminology("VP Sprint")).toBe(true);
    const cards = buildHomeTodayPriorities([
      mockPriority({ title: "VP Sprint", description: "Promotion Sprint" }),
      mockPriority({ title: "完成這個月的量測" }),
    ]);
    expect(cards[0].title).not.toMatch(/Sprint/i);
    expect(cards[1].title).toBe("完成這個月的量測");
    expect(JSON.stringify(cards)).not.toMatch(/sourceKey|QUALIFICATION|score/);
  });

  it("MY-11 Leader cloud does not block first render", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("readMissionControlMetrics");
    expect(home).not.toContain("fetchCloudOrganizationData");
    expect(home).not.toContain("fetchDownlineCloudData");
    expect(home).not.toContain("replaceLocalMembersFromCloud");
  });

  it("MY-12 unused MapUniverse presentation not built", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).not.toContain("MapUniverseSection");
    expect(home).toContain("includeMapUniverse: false");
    const recalc = readFileSync(
      resolve(process.cwd(), "src/lib/services/recalculate-member-metrics.ts"),
      "utf8",
    );
    expect(recalc).toContain("includeMapUniverse");
    expect(recalc).toMatch(/includeMapUniverse !== false/);
  });

  it("MY-13 existing qualification authority unchanged", () => {
    const status = readFileSync(resolve(process.cwd(), "src/lib/business-engine/rules/qualification.ts"), "utf8");
    expect(status).toContain("qualification_supervisor");
    // Home presentation only — no edits to qualification rules file in this feature beyond imports.
    const homePres = readFileSync(
      resolve(process.cwd(), "src/lib/home/my-home-presentation.ts"),
      "utf8",
    );
    expect(homePres).not.toContain("DEFAULT_QUALIFICATION_RULES");
    expect(homePres).not.toContain("evaluateAllQualificationRules");
  });

  it("MY-14 gamification scoring unchanged", () => {
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).not.toContain("availablePoints");
    expect(home).not.toContain("currentStreak");
    expect(home).not.toContain("calculateAchievementEngine");
  });

  it("MY-15 mobile long priority wraps", () => {
    const long = "這是一段很長的優先事項說明文字，用來確認首頁今天區塊不會被截成單行而溢出。".repeat(2);
    const cards = buildHomeTodayPriorities([mockPriority({ title: long })]);
    expect(cards[0].title.length).toBeGreaterThan(40);
    const home = readFileSync(resolve(process.cwd(), "src/components/home/HomePage.tsx"), "utf8");
    expect(home).toContain("break-words");
    expect(home).toContain("min-h-11");
  });
});
