import { RECOGNITION_PPTX_SLIDE } from "@/lib/recognition/recognition-presentation-layout";
import type { RecognitionMasterId } from "@/lib/recognition/recognition-presentation-assets";

export type RecognitionSlideBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RecognitionTitleGeometry = RecognitionSlideBox & {
  maxFontPt: number;
  minFontPt: number;
};

export type RecognitionPortraitSlot = {
  photo: RecognitionSlideBox;
  inner: RecognitionSlideBox;
  overlay: RecognitionSlideBox;
  name: RecognitionSlideBox;
};

export const RECOGNITION_PORTRAIT_ASPECT = 0.75;
export const RECOGNITION_PORTRAIT_RENDER_DPI = 144;

/** Full-slide placement for every approved master PNG. 4:3, no distortion. */
export const RECOGNITION_MASTER_FILL: RecognitionSlideBox = {
  x: 0,
  y: 0,
  w: RECOGNITION_PPTX_SLIDE.widthIn,
  h: RECOGNITION_PPTX_SLIDE.heightIn,
};

/**
 * Per-master title boxes. Text stays inside this rectangle: shrink font, never
 * move into the crown or down into portraits. Coordinates are inches on 10×7.5.
 */
export const RECOGNITION_TITLE_GEOMETRY: Record<RecognitionMasterId, RecognitionTitleGeometry> = {
  "name-only": { x: 2.55, y: 1.12, w: 4.9, h: 0.3, maxFontPt: 22, minFontPt: 12 },
  "hero-1": { x: 3.05, y: 1.48, w: 3.9, h: 0.22, maxFontPt: 15, minFontPt: 10 },
  "hero-2-3": { x: 3.15, y: 1.64, w: 3.7, h: 0.32, maxFontPt: 20, minFontPt: 11 },
  "wall-4-12": { x: 2.7, y: 1.61, w: 4.6, h: 0.17, maxFontPt: 13, minFontPt: 10 },
  "million-lifetime": { x: 1.3, y: 0.04, w: 7.4, h: 0.26, maxFontPt: 16, minFontPt: 10 },
};

/** Visible badge size in inches after transparent padding is trimmed. */
const BADGE_SIZE: Record<RecognitionMasterId, number> = {
  "name-only": 1.62,
  "hero-1": 1.7,
  "hero-2-3": 1.6,
  "wall-4-12": 1.38,
  "million-lifetime": 1.55,
};

export const RECOGNITION_PAGE_INDICATOR_BOX: RecognitionSlideBox = {
  x: 8.78,
  y: 0.14,
  w: 1.05,
  h: 0.28,
};

export const RECOGNITION_NAME_ON_NAVY = "#F6F0E4";
export const RECOGNITION_NAME_ON_GOLD = "#0B1F3A";

const HERO_1_INNER: RecognitionSlideBox = { x: 3.4669, y: 1.8163, w: 3.0318, h: 4.2058 };
const HERO_1_PHOTO: RecognitionSlideBox = { x: 3.536, y: 1.8854, w: 2.8936, h: 4.0676 };
const HERO_1_OVERLAY: RecognitionSlideBox = { x: 3.4392, y: 1.7887, w: 3.087, h: 4.32 };
const HERO_1_NAME: RecognitionSlideBox = { x: 3.2, y: 6.32, w: 3.6, h: 0.28 };

const HERO_3_INNER: readonly RecognitionSlideBox[] = [
  { x: 1.1671, y: 2.2099, w: 2.1961, h: 3.5152 },
  { x: 3.8812, y: 2.2099, w: 2.1754, h: 3.5152 },
  { x: 6.5953, y: 2.2099, w: 2.2445, h: 3.5152 },
];
const HERO_3_PHOTO: readonly RecognitionSlideBox[] = [
  { x: 1.2362, y: 2.279, w: 2.0579, h: 3.377 },
  { x: 3.9503, y: 2.279, w: 2.0372, h: 3.377 },
  { x: 6.6644, y: 2.279, w: 2.1063, h: 3.377 },
];
const HERO_3_OVERLAY: readonly RecognitionSlideBox[] = [
  { x: 1.0152, y: 2.134, w: 2.4999, h: 3.7845 },
  { x: 3.6878, y: 2.134, w: 2.5622, h: 3.7845 },
  { x: 6.4433, y: 2.134, w: 2.5622, h: 3.7845 },
];

/**
 * Extracted center-frame sprite from hero-2-3.png. Overlay origin + inner
 * offset are locked to that PNG so the gold ring matches the approved art.
 */
const HERO_PAIR_FRAME = {
  overlayW: 2.5622,
  overlayH: 3.7845,
  innerOffsetX: 0.1934,
  innerOffsetY: 0.0759,
  innerW: 2.1754,
  innerH: 3.5152,
  photoInset: 0.0691,
  gap: 0.28,
  overlayY: 2.134,
} as const;

const WALL_INNER: readonly RecognitionSlideBox[] = [
  { x: 0.8425, y: 1.9199, w: 1.0635, h: 1.6298 },
  { x: 2.2514, y: 1.9199, w: 1.0704, h: 1.6298 },
  { x: 3.6602, y: 1.9199, w: 1.0912, h: 1.6298 },
  { x: 5.1105, y: 1.9199, w: 1.0981, h: 1.6298 },
  { x: 6.5608, y: 1.9199, w: 1.105, h: 1.6298 },
  { x: 8.018, y: 1.9199, w: 1.0912, h: 1.6298 },
  { x: 0.8425, y: 3.9503, w: 1.0635, h: 1.6436 },
  { x: 2.2583, y: 3.9503, w: 1.0635, h: 1.6436 },
  { x: 3.6602, y: 3.9503, w: 1.0912, h: 1.6436 },
  { x: 5.1105, y: 3.9503, w: 1.0981, h: 1.6436 },
  { x: 6.5608, y: 3.9503, w: 1.105, h: 1.6436 },
  { x: 8.018, y: 3.9503, w: 1.0912, h: 1.6436 },
];
const WALL_PHOTO: readonly RecognitionSlideBox[] = [
  { x: 0.9116, y: 1.989, w: 0.9253, h: 1.4916 },
  { x: 2.3205, y: 1.989, w: 0.9322, h: 1.4916 },
  { x: 3.7294, y: 1.989, w: 0.9528, h: 1.4916 },
  { x: 5.1796, y: 1.989, w: 0.9599, h: 1.4916 },
  { x: 6.6299, y: 1.989, w: 0.9668, h: 1.4916 },
  { x: 8.0871, y: 1.989, w: 0.953, h: 1.4916 },
  { x: 0.9116, y: 4.0194, w: 0.9253, h: 1.5054 },
  { x: 2.3274, y: 4.0194, w: 0.9253, h: 1.5054 },
  { x: 3.7294, y: 4.0194, w: 0.9528, h: 1.5054 },
  { x: 5.1796, y: 4.0194, w: 0.9599, h: 1.5054 },
  { x: 6.6299, y: 4.0194, w: 0.9668, h: 1.5054 },
  { x: 8.0871, y: 4.0194, w: 0.953, h: 1.5054 },
];
const WALL_NAME_PLAQUES: readonly RecognitionSlideBox[] = [
  { x: 0.8425, y: 3.57, w: 1.0635, h: 0.2 },
  { x: 2.2514, y: 3.57, w: 1.0704, h: 0.2 },
  { x: 3.6602, y: 3.57, w: 1.0912, h: 0.2 },
  { x: 5.1105, y: 3.57, w: 1.0981, h: 0.2 },
  { x: 6.5608, y: 3.57, w: 1.105, h: 0.2 },
  { x: 8.018, y: 3.57, w: 1.0912, h: 0.2 },
  { x: 0.8425, y: 5.62, w: 1.0635, h: 0.2 },
  { x: 2.2583, y: 5.62, w: 1.0635, h: 0.2 },
  { x: 3.6602, y: 5.62, w: 1.0912, h: 0.2 },
  { x: 5.1105, y: 5.62, w: 1.0981, h: 0.2 },
  { x: 6.5608, y: 5.62, w: 1.105, h: 0.2 },
  { x: 8.018, y: 5.62, w: 1.0912, h: 0.2 },
];

/**
 * Million Lifetime + exactly 1 recipient. Inner/photo boxes are the bounding
 * squares of the baked circular medallion opening (extracted overlay sits above).
 */
const MILLION_1_INNER: RecognitionSlideBox = { x: 3.2782, y: 1.6428, w: 3.446, h: 3.446 };
const MILLION_1_PHOTO: RecognitionSlideBox = { x: 3.3127, y: 1.6774, w: 3.377, h: 3.377 };
const MILLION_1_NAME: RecognitionSlideBox = { x: 2.2, y: 5.28, w: 5.6, h: 0.36 };

const NAME_ONLY_CONTENT: RecognitionSlideBox = {
  x: 0.9,
  y: 1.78,
  w: 8.2,
  h: 4.08,
};

const NAME_ONLY_LINE_BOXES: readonly RecognitionSlideBox[] = [
  { x: 1.4, y: 2.22, w: 7.2, h: 0.4 },
  { x: 1.4, y: 2.94, w: 7.2, h: 0.4 },
  { x: 1.4, y: 3.66, w: 7.2, h: 0.4 },
  { x: 1.4, y: 4.38, w: 7.2, h: 0.4 },
  { x: 1.4, y: 5.1, w: 7.2, h: 0.4 },
];

function boxesIntersect(a: RecognitionSlideBox, b: RecognitionSlideBox, epsilon = 0.001): boolean {
  return a.x + a.w > b.x + epsilon
    && b.x + b.w > a.x + epsilon
    && a.y + a.h > b.y + epsilon
    && b.y + b.h > a.y + epsilon;
}

function boxContains(outer: RecognitionSlideBox, inner: RecognitionSlideBox, epsilon = 0.0005): boolean {
  return inner.x + epsilon >= outer.x
    && inner.y + epsilon >= outer.y
    && inner.x + inner.w <= outer.x + outer.w + epsilon
    && inner.y + inner.h <= outer.y + outer.h + epsilon;
}

export function slideBoxesIntersect(a: RecognitionSlideBox, b: RecognitionSlideBox): boolean {
  return boxesIntersect(a, b);
}

export function slideBoxContains(outer: RecognitionSlideBox, inner: RecognitionSlideBox): boolean {
  return boxContains(outer, inner);
}

function heroPairSlots(): RecognitionPortraitSlot[] {
  const total = HERO_PAIR_FRAME.overlayW * 2 + HERO_PAIR_FRAME.gap;
  const start = (RECOGNITION_PPTX_SLIDE.widthIn - total) / 2;
  return [0, 1].map((index) => {
    const overlay: RecognitionSlideBox = {
      x: start + index * (HERO_PAIR_FRAME.overlayW + HERO_PAIR_FRAME.gap),
      y: HERO_PAIR_FRAME.overlayY,
      w: HERO_PAIR_FRAME.overlayW,
      h: HERO_PAIR_FRAME.overlayH,
    };
    const inner: RecognitionSlideBox = {
      x: overlay.x + HERO_PAIR_FRAME.innerOffsetX,
      y: overlay.y + HERO_PAIR_FRAME.innerOffsetY,
      w: HERO_PAIR_FRAME.innerW,
      h: HERO_PAIR_FRAME.innerH,
    };
    const photo: RecognitionSlideBox = {
      x: inner.x + HERO_PAIR_FRAME.photoInset,
      y: inner.y + HERO_PAIR_FRAME.photoInset,
      w: inner.w - HERO_PAIR_FRAME.photoInset * 2,
      h: inner.h - HERO_PAIR_FRAME.photoInset * 2,
    };
    const name: RecognitionSlideBox = {
      x: overlay.x - 0.04,
      y: overlay.y + overlay.h + 0.05,
      w: overlay.w + 0.08,
      h: 0.3,
    };
    return { photo, inner, overlay, name };
  });
}

function nameBelowOverlay(overlay: RecognitionSlideBox, height = 0.3, gap = 0.05): RecognitionSlideBox {
  return {
    x: overlay.x - 0.04,
    y: overlay.y + overlay.h + gap,
    w: overlay.w + 0.08,
    h: height,
  };
}

export function titleGeometryForMaster(masterId: RecognitionMasterId): RecognitionTitleGeometry {
  return RECOGNITION_TITLE_GEOMETRY[masterId];
}

export function titleSafeBoxForMaster(masterId: RecognitionMasterId): RecognitionSlideBox {
  const title = RECOGNITION_TITLE_GEOMETRY[masterId];
  return { x: title.x, y: title.y, w: title.w, h: title.h };
}

export function badgeSizeForMaster(masterId: RecognitionMasterId): number {
  return BADGE_SIZE[masterId];
}

export function titleAndBadgeBoxes(input: {
  masterId: RecognitionMasterId;
  hasBadge: boolean;
}): { title: RecognitionTitleGeometry; badge: RecognitionSlideBox | null } {
  const title = RECOGNITION_TITLE_GEOMETRY[input.masterId];
  if (!input.hasBadge) {
    return { title, badge: null };
  }
  const size = BADGE_SIZE[input.masterId];
  const badgeYByMaster: Record<RecognitionMasterId, number> = {
    "name-only": title.y + title.h / 2 - size / 2,
    "hero-1": 0.72,
    "hero-2-3": 0.44,
    "wall-4-12": 0.48,
    "million-lifetime": 0.12,
  };
  return {
    title,
    badge: {
      x: Math.max(0.2, title.x - 0.14 - size),
      y: Math.max(0.08, badgeYByMaster[input.masterId]),
      w: size,
      h: size,
    },
  };
}

/**
 * Fit award title inside the locked per-master box. Longer names shrink the
 * font; the box itself never moves toward the crown or portraits.
 */
export function fitRecognitionTitleInBox(
  text: string,
  geometry: RecognitionTitleGeometry,
): { text: string; fontSizePt: number } {
  const chars = [...text];
  const maxByHeight = Math.max(geometry.minFontPt, Math.floor((geometry.h * 72) / 1.08));
  let fontSizePt = Math.min(geometry.maxFontPt, maxByHeight);
  while (fontSizePt > geometry.minFontPt) {
    const em = fontSizePt / 72;
    const width = chars.reduce((sum, char) => sum + (char.trim() === "" ? em * 0.35 : /[\u0000-\u00ff]/.test(char) ? em * 0.58 : em), 0);
    const lines = Math.max(1, Math.ceil(width / Math.max(geometry.w, em)));
    const blockH = lines * em * 1.12;
    if (blockH <= geometry.h + 0.002) break;
    fontSizePt -= 0.5;
  }
  return { text, fontSizePt: Math.max(geometry.minFontPt, fontSizePt) };
}

export function viewportPixelSize(box: RecognitionSlideBox): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(box.w * RECOGNITION_PORTRAIT_RENDER_DPI)),
    height: Math.max(1, Math.round(box.h * RECOGNITION_PORTRAIT_RENDER_DPI)),
  };
}

export function nameBoxBelowViewport(
  viewport: RecognitionSlideBox,
  height = 0.36,
  gap = 0.08,
): RecognitionSlideBox {
  return {
    x: viewport.x - 0.06,
    y: viewport.y + viewport.h + gap,
    w: viewport.w + 0.12,
    h: height,
  };
}

export function hero1PortraitSlot(): RecognitionPortraitSlot {
  return { photo: HERO_1_PHOTO, inner: HERO_1_INNER, overlay: HERO_1_OVERLAY, name: HERO_1_NAME };
}

export function hero1PortraitViewport(): RecognitionSlideBox {
  return HERO_1_PHOTO;
}

export function hero1NameBox(): RecognitionSlideBox {
  return HERO_1_NAME;
}

export function hero2PortraitSlots(): RecognitionPortraitSlot[] {
  return heroPairSlots();
}

export function hero2PortraitViewports(): RecognitionSlideBox[] {
  return heroPairSlots().map((slot) => slot.photo);
}

export function hero3PortraitSlots(): RecognitionPortraitSlot[] {
  return HERO_3_PHOTO.map((photo, index) => ({
    photo,
    inner: HERO_3_INNER[index]!,
    overlay: HERO_3_OVERLAY[index]!,
    name: nameBelowOverlay(HERO_3_OVERLAY[index]!),
  }));
}

export function hero3PortraitViewports(): RecognitionSlideBox[] {
  return [...HERO_3_PHOTO];
}

export function wallSlotCount(): number {
  return WALL_INNER.length;
}

export function wallPortraitSlots(): RecognitionPortraitSlot[] {
  return WALL_PHOTO.map((photo, index) => ({
    photo,
    inner: WALL_INNER[index]!,
    overlay: {
      x: WALL_INNER[index]!.x - 0.06,
      y: WALL_INNER[index]!.y - 0.06,
      w: WALL_INNER[index]!.w + 0.12,
      h: WALL_INNER[index]!.h + 0.28,
    },
    name: WALL_NAME_PLAQUES[index]!,
  }));
}

export function wallPortraitViewport(index: number): RecognitionSlideBox {
  const frame = WALL_PHOTO[index];
  if (!frame) {
    throw new Error("wall master has only 12 portrait viewports");
  }
  return frame;
}

export function wallNamePlaque(index: number): RecognitionSlideBox {
  const box = WALL_NAME_PLAQUES[index];
  if (!box) {
    throw new Error("wall master has only 12 name plaques");
  }
  return box;
}

export function millionPortraitSlots(count: number): RecognitionPortraitSlot[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{
      photo: MILLION_1_PHOTO,
      inner: MILLION_1_INNER,
      overlay: RECOGNITION_MASTER_FILL,
      name: MILLION_1_NAME,
    }];
  }
  if (count === 2) {
    return heroPairSlots();
  }
  if (count === 3) {
    return hero3PortraitSlots();
  }
  return millionGridViewports(count).map((photo) => ({
    photo,
    inner: photo,
    overlay: photo,
    name: nameBoxBelowViewport(photo, 0.26, 0.07),
  }));
}

export function millionPortraitViewports(count: number): RecognitionSlideBox[] {
  return millionPortraitSlots(count).map((slot) => slot.photo);
}

function millionGridViewports(count: number): RecognitionSlideBox[] {
  const columns = count <= 8 ? 4 : 6;
  const rows = Math.ceil(count / columns);
  const area: RecognitionSlideBox = { x: 0.85, y: 1.58, w: 8.3, h: 4.1 };
  const gapX = 0.14;
  const gapY = 0.2;
  const cellW = (area.w - gapX * (columns - 1)) / columns;
  const cellH = (area.h - gapY * (rows - 1)) / rows;
  const portraitH = Math.min(cellH - 0.3, cellW / RECOGNITION_PORTRAIT_ASPECT);
  const portraitW = portraitH * RECOGNITION_PORTRAIT_ASPECT;
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    const rowWidth = portraitW * rowCount + gapX * (rowCount - 1);
    const startX = area.x + (area.w - rowWidth) / 2;
    return {
      x: startX + column * (portraitW + gapX),
      y: area.y + row * (cellH + gapY),
      w: portraitW,
      h: portraitH,
    };
  });
}

export function millionNameBox(viewport: RecognitionSlideBox, count: number): RecognitionSlideBox {
  if (count === 1) return MILLION_1_NAME;
  return nameBoxBelowViewport(viewport, count <= 3 ? 0.34 : 0.26, 0.07);
}

export function nameOnlyLineBoxes(count: number): RecognitionSlideBox[] | null {
  if (count < 1 || count > NAME_ONLY_LINE_BOXES.length) return null;
  const indicesByCount: Record<number, number[]> = {
    1: [2],
    2: [1, 3],
    3: [1, 2, 3],
    4: [0, 1, 2, 3],
    5: [0, 1, 2, 3, 4],
  };
  return (indicesByCount[count] ?? []).map((index) => NAME_ONLY_LINE_BOXES[index]!);
}

export function nameOnlyContentBox(): RecognitionSlideBox {
  return NAME_ONLY_CONTENT;
}

export function hero23ClearFramesBox(): RecognitionSlideBox {
  return RECOGNITION_MASTER_FILL;
}
