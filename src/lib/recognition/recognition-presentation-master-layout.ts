import { RECOGNITION_PPTX_SLIDE } from "@/lib/recognition/recognition-presentation-layout";
import type { RecognitionMasterId } from "@/lib/recognition/recognition-presentation-assets";

export type RecognitionSlideBox = {
  x: number;
  y: number;
  w: number;
  h: number;
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
 * Title-safe bands sit BELOW the crown artwork on every master.
 * Measured from the approved PNGs; artwork is not modified.
 */
const TITLE_SAFE: Record<RecognitionMasterId, RecognitionSlideBox> = {
  "name-only": { x: 2.35, y: 1.24, w: 5.3, h: 0.42 },
  "hero-1": { x: 2.3, y: 1.46, w: 5.4, h: 0.38 },
  "hero-2-3": { x: 2.25, y: 1.56, w: 5.5, h: 0.44 },
  "wall-4-12": { x: 2.3, y: 1.58, w: 5.4, h: 0.32 },
  "million-lifetime": { x: 1.4, y: 0.05, w: 7.2, h: 0.36 },
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
export const RECOGNITION_FRAME_GOLD = "#E7C56A";

const HERO_1_VIEWPORT: RecognitionSlideBox = {
  x: 3.47,
  y: 1.83,
  w: 3.02,
  h: 4.22,
};

const HERO_3_VIEWPORTS: readonly RecognitionSlideBox[] = [
  { x: 1.22, y: 2.26, w: 2.1, h: 3.4 },
  { x: 3.93, y: 2.26, w: 2.08, h: 3.4 },
  { x: 6.66, y: 2.26, w: 2.12, h: 3.4 },
];

/**
 * Two-person overlay on the 2–3 master. Independent of the three painted
 * frames so the center slot is not an empty-person placeholder.
 * Exact 3:4 viewports, centered as a pair.
 */
const HERO_2_VIEWPORTS: readonly RecognitionSlideBox[] = (() => {
  const w = 3.12;
  const h = w / RECOGNITION_PORTRAIT_ASPECT;
  const gap = 0.08;
  const total = w * 2 + gap;
  const start = (RECOGNITION_PPTX_SLIDE.widthIn - total) / 2;
  const y = 2.04;
  return [
    { x: start, y, w, h },
    { x: start + w + gap, y, w, h },
  ];
})();

/**
 * Approved wall master paints 12 gold frames as 6 columns × 2 rows.
 * Pagination still caps at 12 people per slide.
 */
const WALL_VIEWPORTS: readonly RecognitionSlideBox[] = [
  { x: 0.87, y: 1.95, w: 1.01, h: 1.61 },
  { x: 2.26, y: 1.95, w: 1.05, h: 1.62 },
  { x: 3.7, y: 1.95, w: 1.02, h: 1.61 },
  { x: 5.12, y: 1.95, w: 1.05, h: 1.63 },
  { x: 6.57, y: 1.95, w: 1.05, h: 1.63 },
  { x: 8.06, y: 1.95, w: 1.02, h: 1.61 },
  { x: 0.87, y: 3.98, w: 1.01, h: 1.62 },
  { x: 2.26, y: 3.98, w: 1.03, h: 1.63 },
  { x: 3.7, y: 3.98, w: 1.05, h: 1.63 },
  { x: 5.12, y: 3.98, w: 1.05, h: 1.63 },
  { x: 6.57, y: 3.98, w: 1.05, h: 1.63 },
  { x: 8.06, y: 3.98, w: 1.02, h: 1.63 },
];

const WALL_NAME_PLAQUES: readonly RecognitionSlideBox[] = WALL_VIEWPORTS.map((frame, index) => ({
  x: frame.x - 0.05,
  y: index < 6 ? 3.58 : 5.62,
  w: frame.w + 0.1,
  h: 0.26,
}));

const MILLION_CIRCLE_VIEWPORT: RecognitionSlideBox = {
  x: 3.82,
  y: 1.98,
  w: 2.36,
  h: 3.147,
};

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

export function titleSafeBoxForMaster(masterId: RecognitionMasterId): RecognitionSlideBox {
  return TITLE_SAFE[masterId];
}

export function badgeSizeForMaster(masterId: RecognitionMasterId): number {
  return BADGE_SIZE[masterId];
}

export function titleAndBadgeBoxes(input: {
  masterId: RecognitionMasterId;
  hasBadge: boolean;
}): { title: RecognitionSlideBox; badge: RecognitionSlideBox | null } {
  const titleSafe = TITLE_SAFE[input.masterId];
  if (!input.hasBadge) {
    return { title: titleSafe, badge: null };
  }
  const size = BADGE_SIZE[input.masterId];
  const badgeYByMaster: Record<RecognitionMasterId, number> = {
    "name-only": titleSafe.y + titleSafe.h / 2 - size / 2,
    "hero-1": 0.72,
    "hero-2-3": 0.44,
    "wall-4-12": 0.48,
    "million-lifetime": 0.12,
  };
  return {
    title: titleSafe,
    badge: {
      x: Math.max(0.2, titleSafe.x - 0.14 - size),
      y: Math.max(0.08, badgeYByMaster[input.masterId]),
      w: size,
      h: size,
    },
  };
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

export function hero1PortraitViewport(): RecognitionSlideBox {
  return HERO_1_VIEWPORT;
}

export function hero1NameBox(): RecognitionSlideBox {
  return nameBoxBelowViewport(HERO_1_VIEWPORT, 0.34, 0.07);
}

export function hero2PortraitViewports(): RecognitionSlideBox[] {
  return [...HERO_2_VIEWPORTS];
}

export function hero3PortraitViewports(): RecognitionSlideBox[] {
  return [...HERO_3_VIEWPORTS];
}

export function wallSlotCount(): number {
  return WALL_VIEWPORTS.length;
}

export function wallPortraitViewport(index: number): RecognitionSlideBox {
  const frame = WALL_VIEWPORTS[index];
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

export function millionPortraitViewports(count: number): RecognitionSlideBox[] {
  if (count <= 0) return [];
  if (count === 1) return [MILLION_CIRCLE_VIEWPORT];
  if (count === 2) {
    const w = 2.55;
    const h = w / RECOGNITION_PORTRAIT_ASPECT;
    const gap = 0.32;
    const total = w * 2 + gap;
    const start = (RECOGNITION_PPTX_SLIDE.widthIn - total) / 2;
    const y = 1.92;
    return [
      { x: start, y, w, h },
      { x: start + w + gap, y, w, h },
    ];
  }
  if (count === 3) {
    const w = 2.12;
    const h = w / RECOGNITION_PORTRAIT_ASPECT;
    const gap = 0.22;
    const total = w * 3 + gap * 2;
    const start = (RECOGNITION_PPTX_SLIDE.widthIn - total) / 2;
    const y = 2.05;
    return Array.from({ length: 3 }, (_, index) => ({
      x: start + index * (w + gap),
      y,
      w,
      h,
    }));
  }
  return millionGridViewports(count);
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
  if (count === 1) {
    return { x: 2.2, y: 5.28, w: 5.6, h: 0.36 };
  }
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

export function overlayGoldFrame(viewport: RecognitionSlideBox, borderIn = 0.045): RecognitionSlideBox {
  return {
    x: viewport.x - borderIn,
    y: viewport.y - borderIn,
    w: viewport.w + borderIn * 2,
    h: viewport.h + borderIn * 2,
  };
}
