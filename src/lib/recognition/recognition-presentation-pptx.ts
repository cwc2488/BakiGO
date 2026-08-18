import PptxGenJS from "pptxgenjs";
import {
  fitRecognitionPresentationName,
  nameListColumnCount,
  photoGridRowPattern,
  RECOGNITION_PPTX_SLIDE,
} from "@/lib/recognition/recognition-presentation-layout";
import { jpegBufferToPptxData } from "@/lib/recognition/recognition-presentation-images";
import {
  LIFETIME_RECOGNITION_PRESENTATION_THEME,
  pptHex,
  resolveRecognitionPresentationTheme,
} from "@/lib/recognition/recognition-presentation-theme";
import type {
  RecognitionPreparedPortrait,
  RecognitionPresentationCandidate,
  RecognitionPresentationData,
  RecognitionPresentationTheme,
  RecognitionSlidePlan,
} from "@/lib/recognition/recognition-presentation-types";
import { isLifetimeAchievementAwardSlug } from "@/lib/recognition/recognition-presentation-types";

type PptxCtor = typeof PptxGenJS;
type Presentation = InstanceType<PptxCtor>;
type Slide = ReturnType<Presentation["addSlide"]>;

function pptxConstructor(): PptxCtor {
  const imported = PptxGenJS as PptxCtor & { default?: PptxCtor };
  return imported.default ?? imported;
}

function createPresentation(theme: RecognitionPresentationTheme): Presentation {
  const Ctor = pptxConstructor();
  const pptx = new Ctor();
  pptx.defineLayout({
    name: RECOGNITION_PPTX_SLIDE.layoutName,
    width: RECOGNITION_PPTX_SLIDE.widthIn,
    height: RECOGNITION_PPTX_SLIDE.heightIn,
  });
  pptx.layout = RECOGNITION_PPTX_SLIDE.layoutName;
  pptx.author = "Baki GO Recognition Center";
  pptx.title = "表揚名單";
  pptx.subject = "Recognition section";
  pptx.theme = {
    headFontFace: theme.titleTypography.fontFace,
    bodyFontFace: theme.nameTypography.fontFace,
  };
  return pptx;
}

function addBackground(slide: Slide, theme: RecognitionPresentationTheme) {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: RECOGNITION_PPTX_SLIDE.widthIn,
    h: RECOGNITION_PPTX_SLIDE.heightIn,
    fill: { color: pptHex(theme.background) },
    line: { color: pptHex(theme.background), pt: 0 },
  });
  if (theme.decorative.showCornerAccent) {
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: 0.18,
      h: RECOGNITION_PPTX_SLIDE.heightIn,
      fill: { color: pptHex(theme.accent) },
      line: { color: pptHex(theme.accent), pt: 0 },
    });
  }
}

function addAwardChrome(
  slide: Slide,
  plan: RecognitionSlidePlan,
  theme: RecognitionPresentationTheme,
) {
  const { spacing } = theme;
  slide.addText(plan.awardName, {
    x: spacing.slideMarginIn + 0.12,
    y: spacing.titleTopIn,
    w: RECOGNITION_PPTX_SLIDE.widthIn - spacing.slideMarginIn * 2 - 1.1,
    h: spacing.titleHeightIn,
    fontFace: theme.titleTypography.fontFace,
    fontSize: theme.titleTypography.fontSizePt,
    bold: theme.titleTypography.bold,
    color: pptHex(theme.titleTypography.color),
    margin: 0,
    valign: "middle",
    wrap: true,
  });

  if (plan.pageCount > 1) {
    slide.addText(`${plan.pageIndex} / ${plan.pageCount}`, {
      x: RECOGNITION_PPTX_SLIDE.widthIn - spacing.slideMarginIn - 1.05,
      y: spacing.titleTopIn + 0.08,
      w: 1.0,
      h: 0.36,
      fontFace: theme.captionTypography.fontFace,
      fontSize: theme.captionTypography.fontSizePt,
      color: pptHex(theme.captionTypography.color),
      align: "right",
      valign: "middle",
      margin: 0,
    });
  }

  slide.addShape("rect", {
    x: spacing.slideMarginIn + 0.12,
    y: spacing.titleTopIn + spacing.titleHeightIn,
    w: 2.4,
    h: theme.decorative.ruleHeightIn,
    fill: { color: pptHex(theme.decorative.ruleColor) },
    line: { color: pptHex(theme.decorative.ruleColor), pt: 0 },
  });
}

function addPortrait(input: {
  slide: Slide;
  x: number;
  y: number;
  width: number;
  height: number;
  portrait: RecognitionPreparedPortrait | undefined;
  theme: RecognitionPresentationTheme;
  displayName: string;
}) {
  const border = input.theme.photoFrame.borderPt / 72;
  input.slide.addShape("rect", {
    x: input.x - border,
    y: input.y - border,
    w: input.width + border * 2,
    h: input.height + border * 2,
    fill: { color: pptHex(input.theme.photoFrame.borderColor) },
    line: { color: pptHex(input.theme.photoFrame.borderColor), pt: 0 },
  });
  input.slide.addShape("rect", {
    x: input.x,
    y: input.y,
    w: input.width,
    h: input.height,
    fill: { color: pptHex(input.theme.photoFrame.backdropColor) },
    line: { color: pptHex(input.theme.photoFrame.backdropColor), pt: 0 },
  });
  if (!input.portrait) {
    throw new Error(`missing presentation portrait for ${input.displayName}`);
  }
  input.slide.addImage({
    data: jpegBufferToPptxData(input.portrait.jpegBuffer),
    x: input.x,
    y: input.y,
    w: input.width,
    h: input.height,
  });
}

function addNameLabel(input: {
  slide: Slide;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  theme: RecognitionPresentationTheme;
  fontSizePt?: number;
  align?: "left" | "center";
}) {
  const fitted = fitRecognitionPresentationName(input.name, {
    baseFontPt: input.fontSizePt ?? input.theme.nameTypography.fontSizePt,
    minFontPt: input.theme.nameTypography.minFontSizePt,
  });
  input.slide.addText(fitted.text, {
    x: input.x,
    y: input.y,
    w: input.width,
    h: input.height,
    fontFace: input.theme.nameTypography.fontFace,
    fontSize: fitted.fontSizePt,
    bold: input.theme.nameTypography.bold,
    color: pptHex(input.theme.nameTypography.color),
    align: input.align ?? "center",
    valign: "middle",
    wrap: true,
    margin: 0,
  });
}

function candidatesForPlan(
  data: RecognitionPresentationData,
  plan: RecognitionSlidePlan,
): RecognitionPresentationCandidate[] {
  const award = data.awards.find((item) => item.eventAwardId === plan.awardId);
  if (!award) return [];
  const byId = new Map(award.candidates.map((candidate) => [candidate.candidateId, candidate]));
  return plan.candidateIds.map((id) => {
    const candidate = byId.get(id);
    if (!candidate) {
      throw new Error(`presentation snapshot missing candidate ${id}`);
    }
    return candidate;
  });
}

function renderNameListSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  theme: RecognitionPresentationTheme;
}) {
  const columns = nameListColumnCount(input.candidates.length);
  const margin = input.theme.spacing.slideMarginIn + 0.18;
  const top = input.theme.spacing.contentTopIn;
  const usableWidth = RECOGNITION_PPTX_SLIDE.widthIn - margin * 2;
  const usableHeight = RECOGNITION_PPTX_SLIDE.heightIn - top - 0.38;
  const columnGap = 0.28;
  const columnWidth = (usableWidth - columnGap * (columns - 1)) / columns;
  const rows = Math.ceil(input.candidates.length / columns);
  const rowHeight = Math.min(0.62, usableHeight / Math.max(rows, 1));

  input.candidates.forEach((candidate, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    addNameLabel({
      slide: input.slide,
      x: margin + column * (columnWidth + columnGap),
      y: top + row * rowHeight,
      width: columnWidth,
      height: rowHeight,
      name: candidate.displayName,
      theme: input.theme,
      fontSizePt: columns === 1 ? 32 : columns === 2 ? 24 : 20,
      align: columns === 1 ? "center" : "left",
    });
  });
}

function renderPhotoHeroSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const count = input.candidates.length;
  const top = input.theme.spacing.contentTopIn + 0.08;
  const availableHeight = RECOGNITION_PPTX_SLIDE.heightIn - top - 0.85;
  const portraitHeight = Math.min(4.55, availableHeight);
  const portraitWidth = portraitHeight * 0.75;
  const gap = count === 1 ? 0 : 0.42;
  const totalWidth = portraitWidth * count + gap * (count - 1);
  const startX = (RECOGNITION_PPTX_SLIDE.widthIn - totalWidth) / 2;

  input.candidates.forEach((candidate, index) => {
    const x = startX + index * (portraitWidth + gap);
    addPortrait({
      slide: input.slide,
      x,
      y: top,
      width: portraitWidth,
      height: portraitHeight,
      portrait: input.portraits.get(candidate.candidateId),
      theme: input.theme,
      displayName: candidate.displayName,
    });
    addNameLabel({
      slide: input.slide,
      x: x - 0.12,
      y: top + portraitHeight + 0.12,
      width: portraitWidth + 0.24,
      height: 0.58,
      name: candidate.displayName,
      theme: input.theme,
      fontSizePt: count === 1 ? 30 : 22,
    });
  });
}

function renderPhotoGridSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const pattern = photoGridRowPattern(input.candidates.length);
  const margin = input.theme.spacing.slideMarginIn + 0.12;
  const top = input.theme.spacing.contentTopIn;
  const usableWidth = RECOGNITION_PPTX_SLIDE.widthIn - margin * 2;
  const usableHeight = RECOGNITION_PPTX_SLIDE.heightIn - top - 0.28;
  const rowGap = 0.16;
  const colGap = 0.16;
  const rowCount = pattern.length;
  const rowHeight = (usableHeight - rowGap * (rowCount - 1)) / rowCount;
  const nameHeight = 0.34;
  const portraitHeight = Math.max(0.9, rowHeight - nameHeight - 0.06);
  const portraitWidth = portraitHeight * 0.75;

  let cursor = 0;
  pattern.forEach((count, rowIndex) => {
    const rowCandidates = input.candidates.slice(cursor, cursor + count);
    cursor += count;
    const rowWidth = portraitWidth * count + colGap * (count - 1);
    const startX = margin + Math.max(0, (usableWidth - rowWidth) / 2);
    const y = top + rowIndex * (rowHeight + rowGap);
    rowCandidates.forEach((candidate, col) => {
      const x = startX + col * (portraitWidth + colGap);
      addPortrait({
        slide: input.slide,
        x,
        y,
        width: portraitWidth,
        height: portraitHeight,
        portrait: input.portraits.get(candidate.candidateId),
        theme: input.theme,
        displayName: candidate.displayName,
      });
      addNameLabel({
        slide: input.slide,
        x: x - 0.04,
        y: y + portraitHeight + 0.04,
        width: portraitWidth + 0.08,
        height: nameHeight,
        name: candidate.displayName,
        theme: input.theme,
        fontSizePt: 13,
      });
    });
  });
}

function themeForPlan(
  plan: RecognitionSlidePlan,
  baseTheme: RecognitionPresentationTheme,
): RecognitionPresentationTheme {
  if (plan.layoutType === "lifetime_achievement" || isLifetimeAchievementAwardSlug(plan.awardSlug)) {
    return {
      ...LIFETIME_RECOGNITION_PRESENTATION_THEME,
      id: baseTheme.id,
      version: baseTheme.version,
    };
  }
  return baseTheme;
}

export async function renderRecognitionPresentationPptx(input: {
  data: RecognitionPresentationData;
  plan: RecognitionSlidePlan[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme?: RecognitionPresentationTheme;
}): Promise<Buffer> {
  const theme = input.theme ?? resolveRecognitionPresentationTheme(input.data.themeId);
  const pptx = createPresentation(theme);

  for (const slidePlan of input.plan) {
    const slideTheme = themeForPlan(slidePlan, theme);
    const slide = pptx.addSlide();
    addBackground(slide, slideTheme);
    addAwardChrome(slide, slidePlan, slideTheme);
    const candidates = candidatesForPlan(input.data, slidePlan);

    if (slidePlan.layoutType === "name_list") {
      renderNameListSlide({ slide, candidates, theme: slideTheme });
      continue;
    }

    if (
      slidePlan.layoutType === "photo_hero_1"
      || slidePlan.layoutType === "photo_hero_2"
      || slidePlan.layoutType === "photo_hero_3"
      || (
        slidePlan.layoutType === "lifetime_achievement"
        && candidates.length <= 3
      )
    ) {
      renderPhotoHeroSlide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
      continue;
    }

    renderPhotoGridSlide({
      slide,
      candidates,
      portraits: input.portraits,
      theme: slideTheme,
    });
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  if (Buffer.isBuffer(output)) return output;
  if (output instanceof ArrayBuffer) return Buffer.from(output);
  if (output instanceof Uint8Array) return Buffer.from(output);
  throw new Error("PPTX renderer did not return a binary buffer");
}
