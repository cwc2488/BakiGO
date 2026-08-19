/** Deterministic 9:16 share-card layout. Character uses contain — never cover. */

export const QUIZ_RESULT_SHARE_WIDTH = 1080;
export const QUIZ_RESULT_SHARE_HEIGHT = 1920;

export type ShareRect = { x: number; y: number; width: number; height: number };

export type QuizResultShareLayout = {
  width: number;
  height: number;
  aspect: "9:16";
  characterFit: "contain";
  background: string;
  ink: string;
  muted: string;
  berry: string;
  brand: ShareRect;
  kicker: ShareRect;
  name: ShareRect;
  character: ShareRect;
  personality: ShareRect;
  footQuestion: ShareRect;
  footInvite: ShareRect;
  topSafe: number;
  bottomSafe: number;
};

export const QUIZ_RESULT_SHARE_LAYOUT: QuizResultShareLayout = {
  width: QUIZ_RESULT_SHARE_WIDTH,
  height: QUIZ_RESULT_SHARE_HEIGHT,
  aspect: "9:16",
  characterFit: "contain",
  background: "#FFF9F5",
  ink: "#3A2F33",
  muted: "#8A7B80",
  berry: "#B85C72",
  brand: { x: 80, y: 188, width: 920, height: 48 },
  kicker: { x: 80, y: 252, width: 920, height: 56 },
  name: { x: 64, y: 328, width: 952, height: 96 },
  character: { x: 95, y: 440, width: 890, height: 890 },
  personality: { x: 96, y: 1356, width: 888, height: 200 },
  footQuestion: { x: 80, y: 1624, width: 920, height: 56 },
  footInvite: { x: 80, y: 1688, width: 920, height: 56 },
  topSafe: 180,
  bottomSafe: 176,
};

export function containRect(
  sourceWidth: number,
  sourceHeight: number,
  box: ShareRect,
): ShareRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { ...box, width: 0, height: 0 };
  }
  const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

export function shareCardAspect(width = QUIZ_RESULT_SHARE_WIDTH, height = QUIZ_RESULT_SHARE_HEIGHT): number {
  return width / height;
}
