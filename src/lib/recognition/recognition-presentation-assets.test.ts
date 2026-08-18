import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_RECOGNITION_AWARDS } from "@/lib/recognition/recognition-domain";
import {
  loadRecognitionMasterDataUri,
  RECOGNITION_AWARD_SLUG_BADGE_IDS,
  RECOGNITION_BADGE_RELATIVE_PATHS,
  RECOGNITION_FRAME_RELATIVE_PATHS,
  RECOGNITION_MASTER_RELATIVE_PATHS,
  recognitionAssetAbsolutePath,
  recognitionBadgeIdForAwardSlug,
  selectRecognitionMaster,
} from "@/lib/recognition/recognition-presentation-assets";
import { RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG } from "@/lib/recognition/recognition-presentation-types";
import {
  hero1PortraitViewport,
  hero2PortraitSlots,
  hero2PortraitViewports,
  hero3PortraitViewports,
  titleAndBadgeBoxes,
  titleGeometryForMaster,
  titleSafeBoxForMaster,
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
    for (const relativePath of Object.values(RECOGNITION_FRAME_RELATIVE_PATHS)) {
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
  it("uses cover-fit viewports rather than letterboxed contain", () => {
    const hero1 = hero1PortraitViewport();
    expect(hero1.w).toBeGreaterThan(2.5);
    expect(hero1.h).toBeGreaterThan(3.5);
  });

  it("places two people in a centered pair, not a 3-frame layout", () => {
    const two = hero2PortraitViewports();
    const three = hero3PortraitViewports();
    expect(two).toHaveLength(2);
    expect(three).toHaveLength(3);
    expect(two[0]?.x).not.toBe(three[0]?.x);
    expect(two[1]?.x).not.toBe(three[2]?.x);
    const left = two[0]!;
    const right = two[1]!;
    const leftGap = left.x;
    const rightGap = 10 - (right.x + right.w);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(0.02);
    expect(left.w).toBeCloseTo(right.w, 5);
    expect(left.h).toBeCloseTo(right.h, 5);
    expect(left.y).toBeCloseTo(right.y, 5);
    const slots = hero2PortraitSlots();
    expect(slots).toHaveLength(2);
    expect(slots[0]!.photo.x).toBeGreaterThan(slots[0]!.inner.x);
    expect(slots[0]!.photo.y).toBeGreaterThan(slots[0]!.inner.y);
    expect(slots[0]!.photo.x + slots[0]!.photo.w).toBeLessThan(slots[0]!.inner.x + slots[0]!.inner.w);
    expect(slots[0]!.photo.y + slots[0]!.photo.h).toBeLessThan(slots[0]!.inner.y + slots[0]!.inner.h);
  });

  it("keeps titles in the locked per-master band below the crown", () => {
    expect(titleSafeBoxForMaster("name-only").y).toBeGreaterThanOrEqual(1.1);
    expect(titleSafeBoxForMaster("hero-1").y).toBeGreaterThanOrEqual(1.45);
    expect(titleSafeBoxForMaster("hero-2-3").y).toBeGreaterThanOrEqual(1.6);
    expect(titleSafeBoxForMaster("wall-4-12").y).toBeGreaterThanOrEqual(1.55);
    expect(titleGeometryForMaster("hero-1").maxFontPt).toBeLessThanOrEqual(15);
    expect(titleGeometryForMaster("wall-4-12").maxFontPt).toBeLessThanOrEqual(13);
  });

  it("sizes mapped badges for projector visibility", () => {
    const supervisor = titleAndBadgeBoxes({ masterId: "hero-2-3", hasBadge: true });
    expect(supervisor.badge).not.toBeNull();
    expect(supervisor.badge?.w ?? 0).toBeGreaterThanOrEqual(1.5);
    expect(supervisor.title.y).toBeGreaterThan(supervisor.badge?.y ?? 0);
    expect(wallSlotCount()).toBe(12);
  });
});
