import { dataUrlToBlob } from "@/lib/images/image-file-utils";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import { buildQuizResultShareCopy } from "@/lib/quiz/viral/quiz-result-share-copy";
import {
  QUIZ_RESULT_SHARE_LAYOUT,
  containRect,
} from "@/lib/quiz/viral/quiz-result-share-layout";

const FONT = '"PingFang TC", "Noto Sans TC", "Hiragino Sans", sans-serif';

function fontSpec(size: number, weight: number): string {
  return `${weight} ${size}px ${FONT}`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
): string[] {
  ctx.font = font;
  const lines: string[] = [];
  let current = "";
  for (const char of text) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法載入角色圖"));
    image.src = src;
  });
}

export async function renderQuizResultShareBlob(animalType: PersonalityType): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("Share visual can only render in the browser.");
  }
  const copy = buildQuizResultShareCopy(animalType);
  const layout = QUIZ_RESULT_SHARE_LAYOUT;
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法產生分享圖");

  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = layout.muted;
  ctx.font = fontSpec(34, 650);
  ctx.fillText(copy.brand, layout.width / 2, layout.brand.y + layout.brand.height / 2);

  ctx.fillStyle = layout.ink;
  ctx.font = fontSpec(40, 600);
  ctx.fillText(copy.kicker, layout.width / 2, layout.kicker.y + layout.kicker.height / 2);

  ctx.fillStyle = layout.berry;
  ctx.font = fontSpec(84, 750);
  ctx.fillText(copy.animalName, layout.width / 2, layout.name.y + layout.name.height / 2);

  const image = await loadImage(copy.characterSrc);
  const dest = containRect(image.naturalWidth || image.width, image.naturalHeight || image.height, layout.character);
  ctx.drawImage(image, dest.x, dest.y, dest.width, dest.height);

  ctx.fillStyle = layout.ink;
  const personalityFont = fontSpec(36, 500);
  const personalityLines = wrapText(ctx, copy.personality, layout.personality.width, personalityFont);
  ctx.font = personalityFont;
  const lineHeight = 48;
  const textBlockHeight = personalityLines.length * lineHeight;
  const textStart = layout.personality.y + (layout.personality.height - textBlockHeight) / 2 + lineHeight / 2;
  personalityLines.forEach((line, index) => {
    ctx.fillText(line, layout.width / 2, textStart + index * lineHeight);
  });

  ctx.fillStyle = layout.ink;
  ctx.font = fontSpec(40, 700);
  ctx.fillText(copy.footQuestion, layout.width / 2, layout.footQuestion.y + layout.footQuestion.height / 2);

  ctx.fillStyle = layout.berry;
  ctx.font = fontSpec(36, 650);
  ctx.fillText(copy.footInvite, layout.width / 2, layout.footInvite.y + layout.footInvite.height / 2);

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrlToBlob(dataUrl);
}

export function shareImageFilename(animalName: string): string {
  return `baki-go-${animalName}.png`;
}
