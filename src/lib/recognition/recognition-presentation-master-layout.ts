import { RECOGNITION_PPTX_SLIDE } from "@/lib/recognition/recognition-presentation-layout";
import type { RecognitionMasterId } from "@/lib/recognition/recognition-presentation-assets";

export type RecognitionSlideBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const RECOGNITION_PORTRAIT_ASPECT = 0.75;

/** Full-slide placement for every approved master PNG. 4:3, no distortion. */
export const RECOGNITION_MASTER_FILL: RecognitionSlideBox = {
  x: 0,
  y: 0,
  w: RECOGNITION_PPTX_SLIDE.widthIn,
  h: RECOGNITION_PPTX_SLIDE.heightIn,
};

export const RECOGNITION_NAVY_TITLE_BOX: RecognitionSlideBox = {
  x: 1.55,
  y: 0.9,
  w: 6.9,
  h: 0.52,
};

export const RECOGNITION_MILLION_TITLE_BOX: RecognitionSlideBox = {
  x: 0.7,
  y: 0.1,
  w: 8.6,
  h: 0.48,
};

export const RECOGNITION_BADGE_BOX: RecognitionSlideBox = {
  x: 0.18,
  y: 0.42,
  w: 1.02,
  h: 1.02,
};

export const RECOGNITION_PAGE_INDICATOR_BOX: RecognitionSlideBox = {
  x: 8.72,
  y: 0.18,
  w: 1.08,
  h: 0.3,
};

export const RECOGNITION_NAME_ON_NAVY = "#F6F0E4";
export const RECOGNITION_NAME_ON_GOLD = "#0B1F3A";

const HERO_1_FRAME: RecognitionSlideBox = {
  x: 3.49,
  y: 1.84,
  w: 2.98,
  h: 4.2,
};

const HERO_23_FRAMES: readonly RecognitionSlideBox[] = [
  { x: 1.2, y: 2.24, w: 2.14, h: 3.44 },
  { x: 3.91, y: 2.24, w: 2.12, h: 3.44 },
  { x: 6.64, y: 2.24, w: 2.16, h: 3.44 },
];

/**
 * Approved wall master paints 12 gold frames as 6 columns × 2 rows.
 * Pagination still caps at 12 people per slide. Placement follows the
 * master composition rather than overlaying a separate 4×3 grid.
 */
const WALL_FRAMES: readonly RecognitionSlideBox[] = [
  { x: 0.86, y: 1.94, w: 1.03, h: 1.63 },
  { x: 2.25, y: 1.94, w: 1.07, h: 1.64 },
  { x: 3.69, y: 1.94, w: 1.04, h: 1.63 },
  { x: 5.11, y: 1.94, w: 1.07, h: 1.65 },
  { x: 6.56, y: 1.94, w: 1.07, h: 1.65 },
  { x: 8.05, y: 1.94, w: 1.04, h: 1.63 },
  { x: 0.86, y: 3.97, w: 1.03, h: 1.64 },
  { x: 2.25, y: 3.97, w: 1.05, h: 1.65 },
  { x: 3.69, y: 3.97, w: 1.07, h: 1.65 },
  { x: 5.11, y: 3.97, w: 1.07, h: 1.65 },
  { x: 6.56, y: 3.97, w: 1.07, h: 1.65 },
  { x: 8.05, y: 3.97, w: 1.04, h: 1.65 },
];

const WALL_NAME_PLAQUES: readonly RecognitionSlideBox[] = WALL_FRAMES.map((frame, index) => ({
  x: frame.x - 0.06,
  y: index < 6 ? 3.58 : 5.6,
  w: frame.w + 0.12,
  h: 0.28,
}));

const MILLION_CIRCLE: RecognitionSlideBox = {
  x: 3.32,
  y: 1.72,
  w: 3.36,
  h: 3.32,
};

const NAME_ONLY_CONTENT: RecognitionSlideBox = {
  x: 0.9,
  y: 1.82,
  w: 8.2,
  h: 4.05,
};

/** Gold underline rows on name-only.png. Names sit just above each line. */
const NAME_ONLY_LINE_BOXES: readonly RecognitionSlideBox[] = [
  { x: 1.4, y: 2.22, w: 7.2, h: 0.4 },
  { x: 1.4, y: 2.94, w: 7.2, h: 0.4 },
  { x: 1.4, y: 3.66, w: 7.2, h: 0.4 },
  { x: 1.4, y: 4.38, w: 7.2, h: 0.4 },
  { x: 1.4, y: 5.1, w: 7.2, h: 0.4 },
];

export function titleBoxForMaster(masterId: RecognitionMasterId): RecognitionSlideBox {
  return masterId === "million-lifetime" ? RECOGNITION_MILLION_TITLE_BOX : RECOGNITION_NAVY_TITLE_BOX;
}

export function insetBox(box: RecognitionSlideBox, insetIn: number): RecognitionSlideBox {
  return {
    x: box.x + insetIn,
    y: box.y + insetIn,
    w: Math.max(0.1, box.w - insetIn * 2),
    h: Math.max(0.1, box.h - insetIn * 2),
  };
}

/**
 * Place a 3:4 portrait entirely inside a master frame (contain, never cover-crop).
 */
export function fitPortraitInFrame(
  frame: RecognitionSlideBox,
  aspect = RECOGNITION_PORTRAIT_ASPECT,
): RecognitionSlideBox {
  const heightIfFullWidth = frame.w / aspect;
  if (heightIfFullWidth <= frame.h) {
    return {
      x: frame.x,
      y: frame.y + (frame.h - heightIfFullWidth) / 2,
      w: frame.w,
      h: heightIfFullWidth,
    };
  }
  const widthIfFullHeight = frame.h * aspect;
  return {
    x: frame.x + (frame.w - widthIfFullHeight) / 2,
    y: frame.y,
    w: widthIfFullHeight,
    h: frame.h,
  };
}

export function hero1PortraitFrame(): RecognitionSlideBox {
  return HERO_1_FRAME;
}

export function hero1NameBox(): RecognitionSlideBox {
  return { x: 2.4, y: 6.16, w: 5.2, h: 0.42 };
}

export function hero23PortraitFrames(count: 2 | 3): RecognitionSlideBox[] {
  if (count === 2) return [HERO_23_FRAMES[0]!, HERO_23_FRAMES[2]!];
  return [...HERO_23_FRAMES];
}

export function nameBoxBelowFrame(frame: RecognitionSlideBox, height = 0.4): RecognitionSlideBox {
  return {
    x: frame.x - 0.08,
    y: frame.y + frame.h + 0.06,
    w: frame.w + 0.16,
    h: height,
  };
}

export function wallSlotCount(): number {
  return WALL_FRAMES.length;
}

export function wallPortraitFrame(index: number): RecognitionSlideBox {
  const frame = WALL_FRAMES[index];
  if (!frame) {
    throw new Error("wall master has only 12 portrait frames");
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

export function millionPortraitFrames(count: number): RecognitionSlideBox[] {
  if (count <= 0) return [];
  if (count === 1) return [MILLION_CIRCLE];
  if (count === 2) {
    return [
      { x: 1.85, y: 1.85, w: 2.45, h: 3.27 },
      { x: 5.7, y: 1.85, w: 2.45, h: 3.27 },
    ];
  }
  if (count === 3) {
    return [
      { x: 1.15, y: 2.05, w: 2.2, h: 2.93 },
      { x: 3.9, y: 2.05, w: 2.2, h: 2.93 },
      { x: 6.65, y: 2.05, w: 2.2, h: 2.93 },
    ];
  }
  return millionGridFrames(count);
}

function millionGridFrames(count: number): RecognitionSlideBox[] {
  const columns = count <= 8 ? 4 : 6;
  const rows = Math.ceil(count / columns);
  const area: RecognitionSlideBox = { x: 0.85, y: 1.55, w: 8.3, h: 4.15 };
  const gapX = 0.16;
  const gapY = 0.22;
  const cellW = (area.w - gapX * (columns - 1)) / columns;
  const cellH = (area.h - gapY * (rows - 1)) / rows;
  const portraitH = Math.min(cellH - 0.32, cellW / RECOGNITION_PORTRAIT_ASPECT);
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

export function millionNameBox(frame: RecognitionSlideBox, count: number): RecognitionSlideBox {
  if (count === 1) {
    return { x: 2.4, y: 5.22, w: 5.2, h: 0.42 };
  }
  return nameBoxBelowFrame(frame, count <= 3 ? 0.38 : 0.28);
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
