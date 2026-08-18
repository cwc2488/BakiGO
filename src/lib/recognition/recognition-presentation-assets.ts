import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { isLifetimeAchievementAwardSlug } from "@/lib/recognition/recognition-presentation-types";
import type { RecognitionSlideLayoutType } from "@/lib/recognition/recognition-presentation-types";

/**
 * Approved Recognition Center visual assets.
 * Artwork is frozen. This module only names paths and maps them deterministically.
 */
export const RECOGNITION_MASTER_IDS = [
  "name-only",
  "hero-1",
  "hero-2-3",
  "wall-4-12",
  "million-lifetime",
] as const;

export type RecognitionMasterId = (typeof RECOGNITION_MASTER_IDS)[number];

export const RECOGNITION_MASTER_RELATIVE_PATHS = {
  "name-only": "public/recognition/masters/name-only.png",
  "hero-1": "public/recognition/masters/hero-1.png",
  "hero-2-3": "public/recognition/masters/hero-2-3.png",
  "wall-4-12": "public/recognition/masters/wall-4-12.png",
  "million-lifetime": "public/recognition/masters/million-lifetime.png",
} as const satisfies Record<RecognitionMasterId, string>;

export const RECOGNITION_BADGE_IDS = [
  "supervisor",
  "world-team",
  "get",
  "get-2500",
  "millionaire-team",
  "millionaire-team-7500",
  "presidents-team",
] as const;

export type RecognitionBadgeId = (typeof RECOGNITION_BADGE_IDS)[number];

export const RECOGNITION_BADGE_RELATIVE_PATHS = {
  supervisor: "public/recognition/badges/supervisor.png",
  "world-team": "public/recognition/badges/world-team.png",
  get: "public/recognition/badges/get.png",
  "get-2500": "public/recognition/badges/get-2500.png",
  "millionaire-team": "public/recognition/badges/millionaire-team.png",
  "millionaire-team-7500": "public/recognition/badges/millionaire-team-7500.png",
  "presidents-team": "public/recognition/badges/presidents-team.png",
} as const satisfies Record<RecognitionBadgeId, string>;

/**
 * Explicit catalog-slug → badge map. Unlisted awards (MAP, 1%世界組, 5K俱樂部,
 * 萬點高手, 百萬終生成就獎, and month-1/2 name-only ranks) get no badge.
 */
export const RECOGNITION_AWARD_SLUG_BADGE_IDS = {
  new_supervisor: "supervisor",
  new_world_team_pass: "world-team",
  new_promo_pass: "get",
  new_ro2500_promo_pass: "get-2500",
  new_wealth_pass: "millionaire-team",
  ro7500_wealth_pass: "millionaire-team-7500",
  new_president_pass: "presidents-team",
} as const satisfies Record<string, RecognitionBadgeId>;

export function recognitionBadgeIdForAwardSlug(awardSlug: string): RecognitionBadgeId | null {
  if (awardSlug in RECOGNITION_AWARD_SLUG_BADGE_IDS) {
    return RECOGNITION_AWARD_SLUG_BADGE_IDS[awardSlug as keyof typeof RECOGNITION_AWARD_SLUG_BADGE_IDS];
  }
  return null;
}

/**
 * Deterministic master selection. 百萬終生成就獎 always wins over recipient count.
 * AI / callers must not choose a layout; they pass planner output only.
 */
export function selectRecognitionMaster(input: {
  awardSlug: string;
  layoutType: RecognitionSlideLayoutType;
  recipientCount: number;
}): RecognitionMasterId {
  if (isLifetimeAchievementAwardSlug(input.awardSlug) || input.layoutType === "lifetime_achievement") {
    return "million-lifetime";
  }
  if (input.layoutType === "name_list") {
    return "name-only";
  }
  if (input.layoutType === "photo_hero_1" || input.recipientCount === 1) {
    return "hero-1";
  }
  if (
    input.layoutType === "photo_hero_2"
    || input.layoutType === "photo_hero_3"
    || input.recipientCount === 2
    || input.recipientCount === 3
  ) {
    return "hero-2-3";
  }
  return "wall-4-12";
}

const pngDataUriCache = new Map<string, string>();

function recognitionMastersDir(): string {
  return join(process.cwd(), "public", "recognition", "masters");
}

function recognitionBadgesDir(): string {
  return join(process.cwd(), "public", "recognition", "badges");
}

export function recognitionMasterAbsolutePath(masterId: RecognitionMasterId): string {
  return join(recognitionMastersDir(), `${masterId}.png`);
}

export function recognitionBadgeAbsolutePath(badgeId: RecognitionBadgeId): string {
  return join(recognitionBadgesDir(), `${badgeId}.png`);
}

export function recognitionAssetAbsolutePath(relativePath: string): string {
  if (relativePath.startsWith("public/recognition/masters/")) {
    const masterId = relativePath.slice("public/recognition/masters/".length).replace(/\.png$/, "");
    if ((RECOGNITION_MASTER_IDS as readonly string[]).includes(masterId)) {
      return recognitionMasterAbsolutePath(masterId as RecognitionMasterId);
    }
  }
  if (relativePath.startsWith("public/recognition/badges/")) {
    const badgeId = relativePath.slice("public/recognition/badges/".length).replace(/\.png$/, "");
    if ((RECOGNITION_BADGE_IDS as readonly string[]).includes(badgeId)) {
      return recognitionBadgeAbsolutePath(badgeId as RecognitionBadgeId);
    }
  }
  throw new Error(`unrecognized recognition visual asset path: ${relativePath}`);
}

function loadPngDataUri(cacheKey: string, absolutePath: string): string {
  const cached = pngDataUriCache.get(cacheKey);
  if (cached) return cached;
  const buffer = readFileSync(absolutePath);
  const dataUri = `image/png;base64,${buffer.toString("base64")}`;
  pngDataUriCache.set(cacheKey, dataUri);
  return dataUri;
}

export function loadRecognitionMasterDataUri(masterId: RecognitionMasterId): string {
  return loadPngDataUri(`master:${masterId}`, recognitionMasterAbsolutePath(masterId));
}

export async function loadTrimmedRecognitionBadgeDataUri(badgeId: RecognitionBadgeId): Promise<string> {
  const cacheKey = `badge-trim:${badgeId}`;
  const cached = pngDataUriCache.get(cacheKey);
  if (cached) return cached;
  const trimmed = await sharp(recognitionBadgeAbsolutePath(badgeId))
    .trim({ threshold: 16 })
    .png()
    .toBuffer();
  const dataUri = `image/png;base64,${trimmed.toString("base64")}`;
  pngDataUriCache.set(cacheKey, dataUri);
  return dataUri;
}
