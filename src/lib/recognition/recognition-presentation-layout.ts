import type {
  RecognitionPresentationAwardSection,
  RecognitionPresentationCandidate,
  RecognitionPresentationData,
  RecognitionSlideLayoutType,
  RecognitionSlidePlan,
} from "@/lib/recognition/recognition-presentation-types";
import { isLifetimeAchievementAwardSlug } from "@/lib/recognition/recognition-presentation-types";

/**
 * Phase 7 name-only pagination is layout configuration — not a frozen business rule.
 * Future themes may change this number without a product-rule change.
 */
export const RECOGNITION_NAME_LIST_LAYOUT = {
  maxNamesPerPage: 18,
  singleColumnMax: 4,
  twoColumnMax: 10,
  baseFontSizePt: 28,
  minFontSizePt: 18,
  comfortableCharsPerLine: 12,
} as const;

export const RECOGNITION_PHOTO_GRID_MAX_PER_PAGE = 12;

/** Standard 4:3 slide used by PptxGenJS LAYOUT_4x3 / custom RECOGNITION_4x3. */
export const RECOGNITION_PPTX_SLIDE = {
  layoutName: "RECOGNITION_4x3",
  widthIn: 10,
  heightIn: 7.5,
  widthEmu: 9144000,
  heightEmu: 6858000,
} as const;

export function chunkItems<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length === 0 ? [] : [items];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

export function nameListColumnCount(namesOnPage: number): number {
  if (namesOnPage <= RECOGNITION_NAME_LIST_LAYOUT.singleColumnMax) return 1;
  if (namesOnPage <= RECOGNITION_NAME_LIST_LAYOUT.twoColumnMax) return 2;
  return 3;
}

/**
 * Adaptive 4–12 photo-grid row pattern. 12 people use the frozen 4×3 grid.
 * Remainders use balanced rows instead of leaving a huge empty 4×3 hole.
 */
export function photoGridRowPattern(countOnPage: number): number[] {
  if (countOnPage <= 0) return [];
  if (countOnPage > RECOGNITION_PHOTO_GRID_MAX_PER_PAGE) {
    throw new Error("photo grid page cannot exceed 12 people");
  }
  const patterns: Record<number, number[]> = {
    1: [1],
    2: [2],
    3: [3],
    4: [2, 2],
    5: [3, 2],
    6: [3, 3],
    7: [4, 3],
    8: [4, 4],
    9: [3, 3, 3],
    10: [4, 3, 3],
    11: [4, 4, 3],
    12: [4, 4, 4],
  };
  return patterns[countOnPage] ?? [countOnPage];
}

export function photoLayoutTypeForCount(countOnPage: number): RecognitionSlideLayoutType {
  if (countOnPage === 1) return "photo_hero_1";
  if (countOnPage === 2) return "photo_hero_2";
  if (countOnPage === 3) return "photo_hero_3";
  return "photo_grid";
}

export type RecognitionFittedName = {
  text: string;
  fontSizePt: number;
  wrap: true;
};

/**
 * Deterministic long-name handling.
 * Never truncates or ellipsizes official recognition names.
 */
export function fitRecognitionPresentationName(
  name: string,
  options?: {
    baseFontPt?: number;
    minFontPt?: number;
    comfortableChars?: number;
  },
): RecognitionFittedName {
  const text = name;
  const baseFontPt = options?.baseFontPt ?? RECOGNITION_NAME_LIST_LAYOUT.baseFontSizePt;
  const minFontPt = options?.minFontPt ?? RECOGNITION_NAME_LIST_LAYOUT.minFontSizePt;
  const comfortableChars = options?.comfortableChars
    ?? RECOGNITION_NAME_LIST_LAYOUT.comfortableCharsPerLine;
  const length = [...text].length;
  if (length <= comfortableChars) {
    return { text, fontSizePt: baseFontPt, wrap: true };
  }
  const extra = length - comfortableChars;
  const fontSizePt = Math.max(minFontPt, baseFontPt - extra);
  return { text, fontSizePt, wrap: true };
}

function planPagesForCandidates(
  section: RecognitionPresentationAwardSection,
  candidatePages: RecognitionPresentationCandidate[][],
  layoutForPage: (count: number) => RecognitionSlideLayoutType,
): RecognitionSlidePlan[] {
  const pageCount = candidatePages.length;
  return candidatePages.map((pageCandidates, index) => ({
    awardId: section.eventAwardId,
    awardSlug: section.awardSlug,
    awardName: section.awardName,
    pageIndex: index + 1,
    pageCount,
    layoutType: layoutForPage(pageCandidates.length),
    candidateIds: pageCandidates.map((candidate) => candidate.candidateId),
  }));
}

function planAwardSection(section: RecognitionPresentationAwardSection): RecognitionSlidePlan[] {
  if (section.candidates.length === 0) return [];

  if (!section.requiresPhoto) {
    const pages = chunkItems(section.candidates, RECOGNITION_NAME_LIST_LAYOUT.maxNamesPerPage);
    return planPagesForCandidates(section, pages, () => "name_list");
  }

  if (isLifetimeAchievementAwardSlug(section.awardSlug)) {
    const pages = chunkItems(section.candidates, RECOGNITION_PHOTO_GRID_MAX_PER_PAGE);
    return planPagesForCandidates(section, pages, () => "lifetime_achievement");
  }

  const pages = chunkItems(section.candidates, RECOGNITION_PHOTO_GRID_MAX_PER_PAGE);
  return planPagesForCandidates(section, pages, photoLayoutTypeForCount);
}

export function planRecognitionPresentation(
  data: RecognitionPresentationData,
): RecognitionSlidePlan[] {
  return data.awards.flatMap(planAwardSection);
}

export function estimateRecognitionPresentationSlideCount(
  data: RecognitionPresentationData,
): number {
  return planRecognitionPresentation(data).length;
}

export function findPresentationCandidate(
  data: RecognitionPresentationData,
  candidateId: string,
): RecognitionPresentationCandidate | null {
  for (const award of data.awards) {
    const found = award.candidates.find((candidate) => candidate.candidateId === candidateId);
    if (found) return found;
  }
  return null;
}
