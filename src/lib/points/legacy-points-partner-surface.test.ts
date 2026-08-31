import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("legacy Points partner surface removal", () => {
  it("removes Points UI from Partner Detail", () => {
    const detail = read("src/components/organization/OrganizationMemberDetail.tsx");
    expect(detail).toContain("本月 VP");
    expect(detail).toContain("本月活動狀態");
    expect(detail).not.toContain("本月積分");
    expect(detail).not.toContain("可兌換");
    expect(detail).not.toContain("歷史總積分");
    expect(detail).not.toContain("兌換積分");
    expect(detail).not.toContain("PointRedemptionModal");
    expect(detail).not.toContain("目前無可兌換積分");
  });

  it("removes Points redeem CTA from Organization Center", () => {
    const page = read("src/components/organization/OrganizationCenterPage.tsx");
    expect(page).not.toContain("兌換積分");
    expect(page).not.toContain("monthlyPoints");
  });

  it("removes Points tiles and leaderboard entry from Profile", () => {
    const profile = read("src/components/profile/MemberProfilePage.tsx");
    expect(profile).not.toContain("本月積分");
    expect(profile).not.toContain('label="可兌換"');
    expect(profile).not.toContain("/leaderboard");
    expect(profile).not.toContain("排行榜");
    expect(profile).toContain("本月 VP");
  });

  it("redirects /leaderboard with no Points retirement notice", () => {
    const route = read("src/app/leaderboard/page.tsx");
    expect(route).toContain('redirect("/")');
    expect(route).not.toContain("積分");
    expect(route).not.toContain("可兌換");
    expect(route).not.toContain("兌換");
    expect(route).not.toContain("已退出");
    expect(route).not.toContain("已停用");
    expect(route).not.toContain("buildPointsLeaderboard");
    expect(route).not.toContain("APP_ICON");

    const leaderboard = read("src/components/leaderboard/LeaderboardPage.tsx");
    expect(leaderboard).toContain('redirect("/")');
    expect(leaderboard).not.toContain("積分");
    expect(leaderboard).not.toContain("可兌換");
    expect(leaderboard).not.toContain("已退出");
    expect(leaderboard).not.toContain("buildPointsLeaderboard");
  });

  it("hides legacy reward XP from Goal and workspace Partner UI", () => {
    const goals = read("src/components/goal-center/GoalCardView.tsx");
    expect(goals).not.toContain("rewardXP");
    expect(goals).not.toContain(" XP");
    expect(goals).not.toContain("積分");

    const workspace = read("src/lib/members/workspace-selectors.ts");
    expect(workspace).not.toContain("積分");
    expect(workspace).not.toContain(" XP");
    expect(workspace).not.toContain("mission.xp");
  });

  it("keeps Points backend modules for recoverability", () => {
    expect(read("src/lib/business-engine/achievement/calculate-points.ts").length).toBeGreaterThan(
      100,
    );
    expect(read("src/lib/repositories/point-redemption-repository.ts").length).toBeGreaterThan(100);
    expect(read("src/types/points.ts").length).toBeGreaterThan(50);
  });
});

describe("canonical Product VP wiring", () => {
  it("organization selectors prefer productVp for 本月 VP", () => {
    const selectors = read("src/lib/organization/organization-selectors.ts");
    expect(selectors).toContain("productVp?.monthlyTotal");
  });

  it("home progress prefers productVp for 本月 VP", () => {
    const home = read("src/lib/home/my-home-presentation.ts");
    expect(home).toContain("productVp?.monthlyTotal");
    expect(home).toContain('label: "本月 VP"');
  });

  it("metrics snapshot includes productVp field", () => {
    const metrics = read("src/lib/services/recalculate-member-metrics.ts");
    expect(metrics).toContain("calculateMonthlyProductVp");
    expect(metrics).toContain("productVp");
  });
});
