import type {
  RecognitionNormalizedCrop,
  RecognitionPresentationPhotoBlocker,
  RecognitionPresentationSummary,
} from "@/types/recognition";

export type {
  RecognitionPresentationPhotoBlocker,
  RecognitionPresentationSummary,
};

/**
 * Phase 7 presentation DTO.
 * Built once from approved roster + crop metadata + event award order + theme.
 * The PPT renderer must not query mutable candidate state while drawing slides.
 */

export const RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG = "million_lifetime";

export type RecognitionSlideLayoutType =
  | "name_list"
  | "photo_hero_1"
  | "photo_hero_2"
  | "photo_hero_3"
  | "photo_grid"
  | "lifetime_achievement";

export type RecognitionPresentationPhoto = {
  sourceEntryId: string;
  storagePath: string;
  mimeType: string;
  originalWidth: number | null;
  originalHeight: number | null;
  crop: RecognitionNormalizedCrop;
};

export type RecognitionPresentationCandidate = {
  candidateId: string;
  displayName: string;
  candidateOrder: number;
  createdAt: string;
  requiresPhoto: boolean;
  photo: RecognitionPresentationPhoto | null;
};

export type RecognitionPresentationAwardSection = {
  eventAwardId: string;
  awardSlug: string;
  awardName: string;
  sortOrder: number;
  requiresPhoto: boolean;
  candidates: RecognitionPresentationCandidate[];
};

export type RecognitionPresentationEvent = {
  id: string;
  name: string;
  year: number;
  month: number;
};

export type RecognitionPresentationData = {
  event: RecognitionPresentationEvent;
  themeId: string;
  themeVersion: string;
  awards: RecognitionPresentationAwardSection[];
};

export type RecognitionSlidePlan = {
  awardId: string;
  awardSlug: string;
  awardName: string;
  pageIndex: number;
  pageCount: number;
  layoutType: RecognitionSlideLayoutType;
  candidateIds: string[];
};

export type RecognitionPresentationThemeTypography = {
  fontFace: string;
  fallbackFontFaces: readonly string[];
  fontSizePt: number;
  minFontSizePt: number;
  color: string;
  bold: boolean;
};

export type RecognitionPresentationTheme = {
  id: string;
  version: string;
  background: string;
  backgroundSecondary: string;
  primaryText: string;
  secondaryText: string;
  accent: string;
  accentMuted: string;
  titleTypography: RecognitionPresentationThemeTypography;
  nameTypography: RecognitionPresentationThemeTypography;
  captionTypography: RecognitionPresentationThemeTypography;
  spacing: {
    slideMarginIn: number;
    titleTopIn: number;
    titleHeightIn: number;
    contentTopIn: number;
  };
  photoFrame: {
    borderColor: string;
    borderPt: number;
    backdropColor: string;
  };
  decorative: {
    ruleColor: string;
    ruleHeightIn: number;
    showCornerAccent: boolean;
  };
};

export type RecognitionPixelCropRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type RecognitionPreparedPortrait = {
  candidateId: string;
  jpegBuffer: Buffer;
  width: number;
  height: number;
};

export function isLifetimeAchievementAwardSlug(slug: string): boolean {
  return slug === RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG;
}
