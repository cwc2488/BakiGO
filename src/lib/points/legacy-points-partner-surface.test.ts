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

  it("removes Points tiles from Profile growth section", () => {
    const profile = read("src/components/profile/MemberProfilePage.tsx");
    expect(profile).not.toContain("本月積分");
    expect(profile).not.toContain('label="可兌換"');
    expect(profile).toContain("本月 VP");
  });

  it("retires Partner leaderboard Points balances", () => {
    const leaderboard = read("src/components/leaderboard/LeaderboardPage.tsx");
    expect(leaderboard).toContain("積分已退出");
    expect(leaderboard).not.toContain("你的本月積分");
    expect(leaderboard).not.toContain("為下線兌換積分");
    expect(leaderboard).not.toContain("buildPointsLeaderboard");
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
