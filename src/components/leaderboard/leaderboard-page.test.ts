import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("LeaderboardPage production crash guards", () => {
  it("scores with a points-only path instead of the full metrics engine", () => {
    const page = readFileSync(join(root, "src/components/leaderboard/LeaderboardPage.tsx"), "utf8");
    const homeSection = readFileSync(
      join(root, "src/components/leaderboard/HomeLeaderboardSection.tsx"),
      "utf8",
    );
    const loader = readFileSync(join(root, "src/lib/points/load-leaderboard-points.ts"), "utf8");

    expect(page).toContain("loadLeaderboardBoards");
    expect(page).not.toContain("loadMemberMetrics");
    expect(page).not.toContain("includeMapUniverse");
    expect(page).not.toContain("recalculateMemberMetrics");
    expect(homeSection).toContain("loadLeaderboardBoards");
    expect(homeSection).not.toContain("loadMemberMetrics");
    expect(loader).toContain("calculatePoints");
    expect(loader).toContain("projectEventsForEngines");
    expect(loader).not.toContain("recalculateMemberMetrics");
    expect(loader).not.toContain("buildMapUniverse");
    expect(loader).not.toContain("collectDownlinePartnerSignals");
    expect(loader).not.toContain("buildEventTimeline");
  });

  it("does not swallow ranking rules or replace them with fake scores", () => {
    const page = readFileSync(join(root, "src/components/leaderboard/LeaderboardPage.tsx"), "utf8");
    expect(page).toContain("loadLeaderboardBoards");
    expect(page).toContain('period="weekly"');
    expect(page).toContain('period="monthly"');
    expect(page).toContain("href=\"/organization\"");
    expect(page).toContain("無法載入排行榜");
    expect(page).not.toContain("fake");
    expect(page).not.toContain("placeholderPoints");
    expect(page).not.toContain("console.error");
  });

  it("keeps Super Admin / Recognition checks off /leaderboard", () => {
    const page = readFileSync(join(root, "src/components/leaderboard/LeaderboardPage.tsx"), "utf8");
    expect(page).not.toContain("isRecognitionAdmin");
    expect(page).not.toContain("resolveIsSuperAdmin");
    expect(page).not.toContain("20699471");
  });
});
