import PptxGenJS from "pptxgenjs";
import {
  loadTrimmedRecognitionBadgeDataUri,
  loadRecognitionFrameDataUri,
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
  fitRecognitionTitleInBox,
  hero1PortraitSlot,
  hero2PortraitSlots,
  hero3PortraitSlots,
  millionPortraitSlots,
  nameOnlyContentBox,
  nameOnlyLineBoxes,
  RECOGNITION_MASTER_FILL,
  RECOGNITION_NAME_ON_GOLD,
  RECOGNITION_NAME_ON_NAVY,
  RECOGNITION_PAGE_INDICATOR_BOX,
  titleAndBadgeBoxes,
  viewportPixelSize,
  wallPortraitSlots,
  type RecognitionPortraitSlot,
  type RecognitionSlideBox,
} from "@/lib/recognition/recognition-presentation-master-layout";
import {
  coverRecognitionPortraitToCircularViewport,
  coverRecognitionPortraitToViewport,
  jpegBufferToPptxData,
  pngBufferToPptxData,
} from "@/lib/recognition/recognition-presentation-images";
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

async function addAwardOverlay(
  slide: Slide,
  plan: RecognitionSlidePlan,
  theme: RecognitionPresentationTheme,
  masterId: RecognitionMasterId,
) {
  const badgeId = recognitionBadgeIdForAwardSlug(plan.awardSlug);
  const boxes = titleAndBadgeBoxes({ masterId, hasBadge: Boolean(badgeId) });
  const fittedTitle = fitRecognitionTitleInBox(plan.awardName, boxes.title);
  slide.addText(fittedTitle.text, {
    x: boxes.title.x,
    y: boxes.title.y,
    w: boxes.title.w,
    h: boxes.title.h,
    fontFace: theme.titleTypography.fontFace,
    fontSize: fittedTitle.fontSizePt,
    bold: theme.titleTypography.bold,
    color: pptHex(theme.titleTypography.color),
    align: "center",
    valign: "middle",
    margin: 0,
    wrap: true,
  });

  if (badgeId && boxes.badge) {
    slide.addImage({
      data: await loadTrimmedRecognitionBadgeDataUri(badgeId),
      x: boxes.badge.x,
      y: boxes.badge.y,
      w: boxes.badge.w,
      h: boxes.badge.h,
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

function addFullSlideOverlay(slide: Slide, frameId: "hero-1-frames" | "hero-2-3-frames" | "hero-2-3-clear-frames" | "wall-frames" | "million-ring") {
  slide.addImage({
    data: loadRecognitionFrameDataUri(frameId),
    x: RECOGNITION_MASTER_FILL.x,
    y: RECOGNITION_MASTER_FILL.y,
    w: RECOGNITION_MASTER_FILL.w,
    h: RECOGNITION_MASTER_FILL.h,
  });
}

async function addCoveredPortrait(input: {
  slide: Slide;
  viewport: RecognitionSlideBox;
  portrait: RecognitionPreparedPortrait | undefined;
  displayName: string;
}) {
  if (!input.portrait) {
    throw new Error(`missing presentation portrait for ${input.displayName}`);
  }
  const pixels = viewportPixelSize(input.viewport);
  const covered = await coverRecognitionPortraitToViewport({
    jpegBuffer: input.portrait.jpegBuffer,
    widthPx: pixels.width,
    heightPx: pixels.height,
  });
  input.slide.addImage({
    data: jpegBufferToPptxData(covered.jpegBuffer),
    x: input.viewport.x,
    y: input.viewport.y,
    w: input.viewport.w,
    h: input.viewport.h,
  });
}

async function addCoveredCircularPortrait(input: {
  slide: Slide;
  viewport: RecognitionSlideBox;
  portrait: RecognitionPreparedPortrait | undefined;
  displayName: string;
}) {
  if (!input.portrait) {
    throw new Error(`missing presentation portrait for ${input.displayName}`);
  }
  const pixels = viewportPixelSize(input.viewport);
  const covered = await coverRecognitionPortraitToCircularViewport({
    jpegBuffer: input.portrait.jpegBuffer,
    diameterPx: Math.min(pixels.width, pixels.height),
  });
  input.slide.addImage({
    data: pngBufferToPptxData(covered.pngBuffer),
    x: input.viewport.x,
    y: input.viewport.y,
    w: input.viewport.w,
    h: input.viewport.h,
  });
}

function addExtractedPortraitFrame(slide: Slide, overlay: RecognitionSlideBox) {
  slide.addImage({
    data: loadRecognitionFrameDataUri("hero-portrait-frame"),
    x: overlay.x,
    y: overlay.y,
    w: overlay.w,
    h: overlay.h,
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

async function addPortraits(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  slots: RecognitionPortraitSlot[];
}) {
  for (const [index, candidate] of input.candidates.entries()) {
    const slot = input.slots[index];
    if (!slot) continue;
    await addCoveredPortrait({
      slide: input.slide,
      viewport: slot.photo,
      portrait: input.portraits.get(candidate.candidateId),
      displayName: candidate.displayName,
    });
  }
}

function addSlotNames(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  slots: RecognitionPortraitSlot[];
  theme: RecognitionPresentationTheme;
  color: string;
  fontSizePt: number;
}) {
  input.candidates.forEach((candidate, index) => {
    const slot = input.slots[index];
    if (!slot) return;
    addNameLabel({
      slide: input.slide,
      box: slot.name,
      name: candidate.displayName,
      theme: input.theme,
      color: input.color,
      fontSizePt: input.fontSizePt,
    });
  });
}

async function renderHero1Slide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const slots = [hero1PortraitSlot()];
  await addPortraits({
    slide: input.slide,
    candidates: input.candidates,
    portraits: input.portraits,
    slots,
  });
  addFullSlideOverlay(input.slide, "hero-1-frames");
  addSlotNames({
    slide: input.slide,
    candidates: input.candidates,
    slots,
    theme: input.theme,
    color: RECOGNITION_NAME_ON_GOLD,
    fontSizePt: 22,
  });
}

async function renderHero23Slide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const twoPerson = input.candidates.length === 2;
  const slots = twoPerson ? hero2PortraitSlots() : hero3PortraitSlots();
  if (twoPerson) {
    addFullSlideOverlay(input.slide, "hero-2-3-clear-frames");
  }
  await addPortraits({
    slide: input.slide,
    candidates: input.candidates,
    portraits: input.portraits,
    slots,
  });
  if (twoPerson) {
    for (const slot of slots) {
      addExtractedPortraitFrame(input.slide, slot.overlay);
    }
  } else {
    addFullSlideOverlay(input.slide, "hero-2-3-frames");
  }
  addSlotNames({
    slide: input.slide,
    candidates: input.candidates,
    slots,
    theme: input.theme,
    color: RECOGNITION_NAME_ON_NAVY,
    fontSizePt: twoPerson ? 20 : 18,
  });
}

async function renderWallSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const slots = wallPortraitSlots();
  if (input.candidates.length > slots.length) {
    throw new Error("wall master cannot place more than 12 recipients on one slide");
  }
  await addPortraits({
    slide: input.slide,
    candidates: input.candidates,
    portraits: input.portraits,
    slots,
  });
  addFullSlideOverlay(input.slide, "wall-frames");
  addSlotNames({
    slide: input.slide,
    candidates: input.candidates,
    slots,
    theme: input.theme,
    color: RECOGNITION_NAME_ON_GOLD,
    fontSizePt: 11,
  });
}

async function renderMillionOneSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  const slots = millionPortraitSlots(1);
  const slot = slots[0]!;
  const candidate = input.candidates[0];
  if (!candidate) {
    throw new Error("million lifetime 1-person slide is missing its recipient");
  }
  await addCoveredCircularPortrait({
    slide: input.slide,
    viewport: slot.photo,
    portrait: input.portraits.get(candidate.candidateId),
    displayName: candidate.displayName,
  });
  addFullSlideOverlay(input.slide, "million-ring");
  addSlotNames({
    slide: input.slide,
    candidates: input.candidates,
    slots,
    theme: input.theme,
    color: RECOGNITION_NAME_ON_NAVY,
    fontSizePt: 26,
  });
}

async function renderMillionSlide(input: {
  slide: Slide;
  candidates: RecognitionPresentationCandidate[];
  portraits: Map<string, RecognitionPreparedPortrait>;
  theme: RecognitionPresentationTheme;
}) {
  if (input.candidates.length === 1) {
    await renderMillionOneSlide(input);
    return;
  }
  const slots = millionPortraitSlots(input.candidates.length);
  await addPortraits({
    slide: input.slide,
    candidates: input.candidates,
    portraits: input.portraits,
    slots,
  });
  if (input.candidates.length <= 3) {
    for (const slot of slots) {
      addExtractedPortraitFrame(input.slide, slot.overlay);
    }
  }
  addSlotNames({
    slide: input.slide,
    candidates: input.candidates,
    slots,
    theme: input.theme,
    color: RECOGNITION_NAME_ON_NAVY,
    fontSizePt: input.candidates.length <= 3 ? 18 : 12,
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

    if (masterId === "name-only") {
      renderNameListSlide({ slide, candidates, theme: slideTheme });
    } else if (masterId === "hero-1") {
      await renderHero1Slide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
    } else if (masterId === "hero-2-3") {
      await renderHero23Slide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
    } else if (masterId === "million-lifetime") {
      await renderMillionSlide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
    } else {
      await renderWallSlide({
        slide,
        candidates,
        portraits: input.portraits,
        theme: slideTheme,
      });
    }
    await addAwardOverlay(slide, slidePlan, slideTheme, masterId);
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  if (Buffer.isBuffer(output)) return output;
  if (output instanceof ArrayBuffer) return Buffer.from(output);
  if (output instanceof Uint8Array) return Buffer.from(output);
  throw new Error("PPTX renderer did not return a binary buffer");
}
