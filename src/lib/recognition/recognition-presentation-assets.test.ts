import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_RECOGNITION_AWARDS } from "@/lib/recognition/recognition-domain";
import {
  loadRecognitionMasterDataUri,
  RECOGNITION_AWARD_SLUG_BADGE_IDS,
  RECOGNITION_BADGE_RELATIVE_PATHS,
  RECOGNITION_MASTER_RELATIVE_PATHS,
  recognitionAssetAbsolutePath,
  recognitionBadgeIdForAwardSlug,
  selectRecognitionMaster,
} from "@/lib/recognition/recognition-presentation-assets";
import { RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG } from "@/lib/recognition/recognition-presentation-types";
import {
  fitPortraitInFrame,
  wallSlotCount,
} from "@/lib/recognition/recognition-presentation-master-layout";

const CATALOG_SLUGS = new Set(DEFAULT_RECOGNITION_AWARDS.map((award) => award.slug));

describe("Recognition approved visual assets", () => {
  it("keeps all 12 approved files at the permanent public paths", () => {
    for (const relativePath of Object.values(RECOGNITION_MASTER_RELATIVE_PATHS)) {
      expect(existsSync(recognitionAssetAbsolutePath(relativePath))).toBe(true);
    }
    for (const relativePath of Object.values(RECOGNITION_BADGE_RELATIVE_PATHS)) {
      expect(existsSync(recognitionAssetAbsolutePath(relativePath))).toBe(true);
    }
  });

  it("loads masters as PNG data URIs without rewriting artwork", () => {
    const dataUri = loadRecognitionMasterDataUri("name-only");
    expect(dataUri.startsWith("image/png;base64,")).toBe(true);
    expect(dataUri.length).toBeGreaterThan(1000);
  });
});

describe("Recognition master selection", () => {
  it("selects name-only, hero, wall, and lifetime masters deterministically", () => {
    expect(selectRecognitionMaster({
      awardSlug: "map_month_1",
      layoutType: "name_list",
      recipientCount: 3,
    })).toBe("name-only");
    expect(selectRecognitionMaster({
      awardSlug: "new_supervisor",
      layoutType: "photo_hero_1",
      recipientCount: 1,
    })).toBe("hero-1");
    expect(selectRecognitionMaster({
      awardSlug: "new_supervisor",
      layoutType: "photo_hero_2",
      recipientCount: 2,
    })).toBe("hero-2-3");
    expect(selectRecognitionMaster({
      awardSlug: "new_supervisor",
      layoutType: "photo_hero_3",
      recipientCount: 3,
    })).toBe("hero-2-3");
    expect(selectRecognitionMaster({
      awardSlug: "club_5k",
      layoutType: "photo_grid",
      recipientCount: 6,
    })).toBe("wall-4-12");
    expect(selectRecognitionMaster({
      awardSlug: "top_10000",
      layoutType: "photo_grid",
      recipientCount: 12,
    })).toBe("wall-4-12");
    expect(selectRecognitionMaster({
      awardSlug: "new_world_team_pass",
      layoutType: "photo_grid",
      recipientCount: 12,
    })).toBe("wall-4-12");
  });

  it("always uses the million-lifetime master for 百萬終生成就獎", () => {
    expect(selectRecognitionMaster({
      awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG,
      layoutType: "lifetime_achievement",
      recipientCount: 1,
    })).toBe("million-lifetime");
    expect(selectRecognitionMaster({
      awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG,
      layoutType: "lifetime_achievement",
      recipientCount: 12,
    })).toBe("million-lifetime");
    expect(selectRecognitionMaster({
      awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG,
      layoutType: "photo_hero_1",
      recipientCount: 1,
    })).toBe("million-lifetime");
  });
});

describe("Recognition badge mapping", () => {
  it("maps only existing catalog slugs to the approved badge files", () => {
    expect(RECOGNITION_AWARD_SLUG_BADGE_IDS).toEqual({
      new_supervisor: "supervisor",
      new_world_team_pass: "world-team",
      new_promo_pass: "get",
      new_ro2500_promo_pass: "get-2500",
      new_wealth_pass: "millionaire-team",
      ro7500_wealth_pass: "millionaire-team-7500",
      new_president_pass: "presidents-team",
    });
    for (const slug of Object.keys(RECOGNITION_AWARD_SLUG_BADGE_IDS)) {
      expect(CATALOG_SLUGS.has(slug as typeof DEFAULT_RECOGNITION_AWARDS[number]["slug"])).toBe(true);
    }
  });

  it("does not infer badges for MAP, 1%世界組, 5K, 萬點高手, or 百萬終生成就獎", () => {
    expect(recognitionBadgeIdForAwardSlug("map_month_1")).toBeNull();
    expect(recognitionBadgeIdForAwardSlug("map_month_3_pass")).toBeNull();
    expect(recognitionBadgeIdForAwardSlug("world_team_1pct")).toBeNull();
    expect(recognitionBadgeIdForAwardSlug("club_5k")).toBeNull();
    expect(recognitionBadgeIdForAwardSlug("top_10000")).toBeNull();
    expect(recognitionBadgeIdForAwardSlug(RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG)).toBeNull();
    expect(recognitionBadgeIdForAwardSlug("new_supervisor")).toBe("supervisor");
  });
});

describe("Recognition master portrait geometry", () => {
  it("keeps 3:4 portraits inside the supplied frame", () => {
    const fitted = fitPortraitInFrame({ x: 1, y: 2, w: 3, h: 5 });
    expect(fitted.w / fitted.h).toBeCloseTo(0.75, 8);
    expect(fitted.w).toBeLessThanOrEqual(3);
    expect(fitted.h).toBeLessThanOrEqual(5);
  });

  it("exposes 12 wall-master slots", () => {
    expect(wallSlotCount()).toBe(12);
  });
});
