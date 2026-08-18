import type { RecognitionPresentationTheme } from "@/lib/recognition/recognition-presentation-types";

/**
 * Default Recognition presentation theme — projector-first, not admin-UI chrome.
 *
 * Fonts are requested by family name only. Proprietary font files are not
 * packaged in the repository. PowerPoint / Keynote fall back if a family is
 * missing on the viewing machine.
 *
 * Preferred CJK family: Microsoft JhengHei (common on Traditional Chinese Windows).
 * Fallbacks: Microsoft YaHei, PingFang TC, Calibri, sans-serif.
 */
export const RECOGNITION_PRESENTATION_FONT_STACK = [
  "Microsoft JhengHei",
  "Microsoft YaHei",
  "PingFang TC",
  "Calibri",
] as const;

export const DEFAULT_RECOGNITION_PRESENTATION_THEME_ID = "recognition_ceremony_navy_gold";
export const DEFAULT_RECOGNITION_PRESENTATION_THEME_VERSION = "1";

const CJK_TITLE: RecognitionPresentationTheme["titleTypography"] = {
  fontFace: RECOGNITION_PRESENTATION_FONT_STACK[0],
  fallbackFontFaces: RECOGNITION_PRESENTATION_FONT_STACK.slice(1),
  fontSizePt: 32,
  minFontSizePt: 22,
  color: "#E7C56A",
  bold: true,
};

const CJK_NAME: RecognitionPresentationTheme["nameTypography"] = {
  fontFace: RECOGNITION_PRESENTATION_FONT_STACK[0],
  fallbackFontFaces: RECOGNITION_PRESENTATION_FONT_STACK.slice(1),
  fontSizePt: 26,
  minFontSizePt: 16,
  color: "#F6F0E4",
  bold: true,
};

const CJK_CAPTION: RecognitionPresentationTheme["captionTypography"] = {
  fontFace: RECOGNITION_PRESENTATION_FONT_STACK[0],
  fallbackFontFaces: RECOGNITION_PRESENTATION_FONT_STACK.slice(1),
  fontSizePt: 12,
  minFontSizePt: 10,
  color: "#C4B7A2",
  bold: false,
};

export const DEFAULT_RECOGNITION_PRESENTATION_THEME: RecognitionPresentationTheme = {
  id: DEFAULT_RECOGNITION_PRESENTATION_THEME_ID,
  version: DEFAULT_RECOGNITION_PRESENTATION_THEME_VERSION,
  background: "#0B1F3A",
  backgroundSecondary: "#102848",
  primaryText: "#F6F0E4",
  secondaryText: "#C4B7A2",
  accent: "#E7C56A",
  accentMuted: "#8C6B2A",
  titleTypography: CJK_TITLE,
  nameTypography: CJK_NAME,
  captionTypography: CJK_CAPTION,
  spacing: {
    slideMarginIn: 0.42,
    titleTopIn: 0.28,
    titleHeightIn: 0.62,
    contentTopIn: 1.08,
  },
  photoFrame: {
    borderColor: "#E7C56A",
    borderPt: 1.5,
    backdropColor: "#08162B",
  },
  decorative: {
    ruleColor: "#E7C56A",
    ruleHeightIn: 0.018,
    showCornerAccent: true,
  },
};

export const LIFETIME_RECOGNITION_PRESENTATION_THEME: RecognitionPresentationTheme = {
  ...DEFAULT_RECOGNITION_PRESENTATION_THEME,
  background: "#081422",
  backgroundSecondary: "#1A1408",
  accent: "#F0D78C",
  accentMuted: "#B8892B",
  titleTypography: {
    ...CJK_TITLE,
    fontSizePt: 34,
    color: "#F0D78C",
  },
  nameTypography: {
    ...CJK_NAME,
    fontSizePt: 28,
    color: "#FFF6DC",
  },
  photoFrame: {
    borderColor: "#F0D78C",
    borderPt: 2.25,
    backdropColor: "#2A1C08",
  },
};

const THEME_REGISTRY: Record<string, RecognitionPresentationTheme> = {
  [DEFAULT_RECOGNITION_PRESENTATION_THEME_ID]: DEFAULT_RECOGNITION_PRESENTATION_THEME,
};

export function resolveRecognitionPresentationTheme(
  themeId?: string | null,
): RecognitionPresentationTheme {
  if (themeId && THEME_REGISTRY[themeId]) {
    return THEME_REGISTRY[themeId];
  }
  return DEFAULT_RECOGNITION_PRESENTATION_THEME;
}

export function pptHex(color: string): string {
  return color.replace("#", "").toUpperCase();
}
