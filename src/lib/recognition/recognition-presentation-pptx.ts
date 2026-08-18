import PptxGenJS from "pptxgenjs";
import {
  loadRecognitionBadgeDataUri,
  loadRecognitionMasterDataUri,
  recognitionBadgeIdForAwardSlug,
  selectRecognitionMaster,
  type RecognitionMasterId,
} from "@/lib/recognition/recognition-presentation-assets";
import {
  fitRecognitionPresentationName,
  nameListColumnCount,
  RECOGNITION_PPTX_SLIDE,
} from "@/lib/recognition/recognition-presentation-layout";
import {
  fitPortraitInFrame,
  hero1NameBox,
  hero1PortraitFrame,
  hero23PortraitFrames,
  millionNameBox,
  millionPortraitFrames,
  nameBoxBelowFrame,
  nameOnlyContentBox,
  nameOnlyLineBoxes,
  RECOGNITION_BADGE_BOX,
  RECOGNITION_MASTER_FILL,
  RECOGNITION_NAME_ON_GOLD,
  RECOGNITION_NAME_ON_NAVY,
  RECOGNITION_PAGE_INDICATOR_BOX,
  titleBoxForMaster,
  wallNamePlaque,
  wallPortraitFrame,
  wallSlotCount,
  type RecognitionSlideBox,
} from "@/lib/recognition/recognition-presentation-master-layout";
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

function addMasterBackground(slide: Slide, masterId: RecognitionMasterId) {
  slide.addImage({
    data: loadRecognitionMasterDataUri(masterId),
    x: RECOGNITION_MASTER_FILL.x,
    y: RECOGNITION_MASTER_FILL.y,
    w: RECOGNITION_MASTER_FILL.w,
    h: RECOGNITION_MASTER_FILL.h,
  });
}

function addAwardOverlay(
  slide: Slide,
  plan: RecognitionSlidePlan,
  theme: RecognitionPresentationTheme,
  masterId: RecognitionMasterId,
) {
  const titleBox = titleBoxForMaster(masterId);
  const fittedTitle = fitRecognitionPresentationName(plan.awardName, {
    baseFontPt: theme.titleTypography.fontSizePt,
    minFontPt: theme.titleTypography.minFontSizePt,
    comfortableChars: 14,
  });
  slide.addText(fittedTitle.text, {
    x: titleBox.x,
    y: titleBox.y,
    w: titleBox.w,
    h: titleBox.h,
    fontFace: theme.titleTypography.fontFace,
    fontSize: fittedTitle.fontSizePt,
    bold: theme.titleTypography.bold,
    color: pptHex(theme.titleTypography.color),
    align: "center",
    valign: "middle",
    margin: 0,
    wrap: true,
  });

  const badgeId = recognitionBadgeIdForAwardSlug(plan.awardSlug);
  if (badgeId) {
    slide.addImage({
      data: loadRecognitionBadgeDataUri(badgeId),
      x: RECOGNITION_BADGE_BOX.x,
      y: RECOGNITION_BADGE_BOX.y,
      w: RECOGNITION_BADGE_BOX.w,
      h: RECOGNITION_BADGE_BOX.h,
    });
  }

  if (plan.pageCount > 1) {
    slide.addText(`${plan.pageIndex} / ${plan.pageCount}`, {
      x: RECOGNITION_PAGE_INDICATOR_BOX.x,
      y: RECOGNITION_PAGE_INDICATOR_BOX.y,
      w: RECOGNITION_PAGE_INDICATOR_BOX.w,
      h: RECOGNITION_PAGE_INDICATOR_BOX.h,
      fontFace: theme.captionTypography.fontFace,
      fontSize: theme.captionTypography.fontSizePt,
      color: pptHex(theme.captionTypography.color),
      align: "right",
      valign: "middle",
      margin: 0,
    });
  }
}

function addPortrait(input: {
  slide: Slide;
  frame: RecognitionSlideBox;
  portrait: RecognitionPreparedPortrait | undefined;
  displayName: string;
}) {
  if (!input.portrait) {
    throw new Error(`missing presentation portrait for ${input.displayName}`);
  }
  const box = fitPortraitInFrame(input.frame);
  input.slide.addImage({
    data: jpegBufferToPptxData(input.portrait.jpegBuffer),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
  });
}

function addNameLabel(input: {
  slide: Slide;
  box: RecognitionSlideBox;
  name: string;
  theme: RecognitionPresentationTheme;
  color: string;
  fontSizePt?: number;
}) {
  const fitted = fitRecognitionPresentationName(input.name, {
    baseFontPt: input.fontSizePt ?? input.theme.nameTypography.fontSizePt,
    minFontPt: input.theme.nameTypography.minFontSizePt,
  });
  input.slide.addText(fitted.text, {
    x: input.box.x,
    y: input.box.y,
    w: input.box.w,
    h: input.box.h,
    fontFace: input.theme.nameTypography.fontFace,
    fontSize: fitted.fontSizePt,
    bold: input.theme.nameTypography.bold,
    color: pptHex(input.color),
    align: "center",
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
  const lineBoxes = nameOnlyLineBoxes(input.candidates.length);
  if (lineBoxes) {
    input.candidates.forEach((candidate, index) => {
      addNameLabel({
        slide: input.slide,
        box: lineBoxes[index]!,
        name: candidate.displayName,
        theme: input.theme,
        color: RECOGNITION_NAME_ON_NAVY,
        fontSizePt: input.candidates.length <= 3 ? 32 : 26,
      });
    });
    return;
  }

  const columns = nameListColumnCount(input.candidates.length);
  const area = nameOnlyContentBox();
  const columnGap = 0.22;
  const columnWidth = (area.w - columnGap * (columns - 1)) / columns;
  const rows = Math.ceil(input.candidates.length / columns);
  const rowHeight = Math.min(0.58, area.h / Math.max(rows, 1));

  input.candidates.forEach((candidate, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    addNameLabel({
      slide: input.slide,
      box: {
        x: area.x + column * (columnWidth + columnGap),
        y: area.y + row * rowHeight,
        w: columnWidth,
        h: rowHeight,
      },
      name: candidate.displayName,
      theme: input.theme,
      color: RECOGNITION_NAME_ON_NAVY,
      fontSizePt: columns === 1 ? 28 : columns === 2 ? 22 : 18,
    });
  });
}

function renderHero1Slide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const candidate = input.candidates[0];
  if (!candidate) return;
  addPortrait({
    slide: input.slide,
    frame: hero1PortraitFrame(),
    portrait: input.portraits.get(candidate.candidateId),
    displayName: candidate.displayName,
  });
  addNameLabel({
    slide: input.slide,
    box: hero1NameBox(),
    name: candidate.displayName,
    theme: input.theme,
    color: RECOGNITION_NAME_ON_GOLD,
    fontSizePt: 28,
  });
}

function renderHero23Slide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const count = input.candidates.length === 2 ? 2 : 3;
  const frames = hero23PortraitFrames(count);
  input.candidates.forEach((candidate, index) => {
    const frame = frames[index];
    if (!frame) return;
    addPortrait({
      slide: input.slide,
      frame,
      portrait: input.portraits.get(candidate.candidateId),
      displayName: candidate.displayName,
    });
    addNameLabel({
      slide: input.slide,
      box: nameBoxBelowFrame(frame),
      name: candidate.displayName,
      theme: input.theme,
      color: RECOGNITION_NAME_ON_NAVY,
      fontSizePt: count === 2 ? 22 : 18,
    });
  });
}

function renderWallSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  if (input.candidates.length > wallSlotCount()) {
    throw new Error("wall master cannot place more than 12 recipients on one slide");
  }
  input.candidates.forEach((candidate, index) => {
    addPortrait({
      slide: input.slide,
      frame: wallPortraitFrame(index),
      portrait: input.portraits.get(candidate.candidateId),
      displayName: candidate.displayName,
    });
    addNameLabel({
      slide: input.slide,
      box: wallNamePlaque(index),
      name: candidate.displayName,
      theme: input.theme,
      color: RECOGNITION_NAME_ON_GOLD,
      fontSizePt: 11,
    });
  });
}

function renderMillionSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const frames = millionPortraitFrames(input.candidates.length);
  input.candidates.forEach((candidate, index) => {
    const frame = frames[index];
    if (!frame) return;
    addPortrait({
      slide: input.slide,
      frame,
      portrait: input.portraits.get(candidate.candidateId),
      displayName: candidate.displayName,
    });
    addNameLabel({
      slide: input.slide,
      box: millionNameBox(frame, input.candidates.length),
      name: candidate.displayName,
      theme: input.theme,
      color: input.candidates.length === 1 ? RECOGNITION_NAME_ON_GOLD : RECOGNITION_NAME_ON_NAVY,
      fontSizePt: input.candidates.length === 1 ? 28 : input.candidates.length <= 3 ? 18 : 12,
    });
  });
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
    const candidates = candidatesForPlan(input.data, slidePlan);
    const masterId = selectRecognitionMaster({
      awardSlug: slidePlan.awardSlug,
      layoutType: slidePlan.layoutType,
      recipientCount: candidates.length,
    });
    const slideTheme = masterId === "million-lifetime"
      ? {
          ...LIFETIME_RECOGNITION_PRESENTATION_THEME,
          id: theme.id,
          version: theme.version,
        }
      : theme;
    const slide = pptx.addSlide();
    addMasterBackground(slide, masterId);
    addAwardOverlay(slide, slidePlan, slideTheme, masterId);

    if (masterId === "name-only") {
      renderNameListSlide({ slide, candidates, theme: slideTheme });
      continue;
    }
    if (masterId === "hero-1") {
      renderHero1Slide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
      continue;
    }
    if (masterId === "hero-2-3") {
      renderHero23Slide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
      continue;
    }
    if (masterId === "million-lifetime") {
      renderMillionSlide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
      continue;
    }
    renderWallSlide({
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
