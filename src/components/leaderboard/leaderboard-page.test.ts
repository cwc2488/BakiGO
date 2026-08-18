import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("LeaderboardPage production crash guards", () => {
  it("skips Map Universe when scoring every active member", () => {
    const page = readFileSync(join(root, "src/components/leaderboard/LeaderboardPage.tsx"), "utf8");
    const homeSection = readFileSync(
      join(root, "src/components/leaderboard/HomeLeaderboardSection.tsx"),
      "utf8",
    );
    const format = readFileSync(join(root, "src/lib/mission-control/format.ts"), "utf8");

    expect(format).toContain("includeMapUniverse: options?.includeMapUniverse");
    expect(page).toContain("includeMapUniverse: false");
    expect(page).toContain('from "@/lib/config/app-config"');
    const appConfigIdx = page.indexOf('from "@/lib/config/app-config"');
    const authIdx = page.indexOf('from "@/lib/auth/auth-service"');
    expect(appConfigIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeGreaterThan(appConfigIdx);
    expect(page).toContain("viewerMetrics.gamification?.streak?.currentStreak ?? 0");
    expect(page).toContain("Leaderboard downline cloud data failed");
    expect(homeSection).toContain("includeMapUniverse: false");
  });

  it("does not swallow ranking rules or replace them with fake scores", () => {
    const page = readFileSync(join(root, "src/components/leaderboard/LeaderboardPage.tsx"), "utf8");
    expect(page).toContain("buildPointsLeaderboard");
    expect(page).toContain('period: "weekly"');
    expect(page).toContain('period: "monthly"');
    expect(page).toContain("href=\"/organization\"");
    expect(page).not.toContain("fake");
    expect(page).not.toContain("placeholderPoints");
  });
});
