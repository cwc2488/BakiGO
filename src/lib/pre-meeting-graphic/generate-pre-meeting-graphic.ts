import type {
  PreMeetingGraphicInput,
  PreMeetingGraphicLayout,
} from "@/types/pre-meeting-graphic";

const WIDTH = 1080;
const HEIGHT = 1350;
const FONT_FAMILY = '"PingFang TC", "Noto Sans TC", sans-serif';

type TextLine = { text: string; gapAfter?: number };

function buildTextLines(input: PreMeetingGraphicInput): TextLine[] {
  const lines: TextLine[] = [
    { text: `邀約人：${input.inviter}` },
    { text: `邀約店家：${input.invitingStore}` },
    { text: `諮詢店家：${input.consultingStore}` },
    { text: `上線績優：${input.uplinePerformance}` },
    { text: `邀約日期：${input.appointmentDateTime}`, gapAfter: 8 },
    { text: `客人名字：${input.customerName}` },
    { text: `電話：${input.phone}` },
    { text: `居住地區：${input.region}` },
    { text: `背景：${input.background}` },
    { text: `年齡：${input.age}` },
    { text: `來源：${input.source}` },
    { text: `需求：${input.need}` },
    { text: `身高/體重：${input.heightWeight}` },
  ];

  if (input.targetWeightLoss.trim()) {
    lines.push({ text: `想減的體重數：${input.targetWeightLoss}` });
  }

  lines.push(
    { text: `決心：${input.determination}`, gapAfter: 8 },
    { text: `身體哪裡不滿意：${input.bodyDissatisfaction}` },
    { text: `試過：${input.triedBefore}`, gapAfter: 8 },
    { text: `希望締結：${input.closingGoal}` },
  );

  if (input.additionalNotes.trim()) {
    lines.push({ text: input.additionalNotes.trim(), gapAfter: 0 });
  }

  return lines.filter((line) => {
    const colonIndex = line.text.indexOf("：");
    if (colonIndex < 0) {
      return line.text.trim().length > 0;
    }
    return line.text.slice(colonIndex + 1).trim().length > 0;
  });
}

function fontSpec(fontSize: number, bold: boolean): string {
  return `${bold ? "bold " : ""}${fontSize}px ${FONT_FAMILY}`;
}

function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  bold: boolean,
): string[] {
  ctx.font = fontSpec(fontSize, bold);
  const paragraphs = text.split("\n");
  const wrapped: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      wrapped.push("");
      continue;
    }

    let current = "";
    for (const char of paragraph) {
      const next = current + char;
      if (ctx.measureText(next).width > maxWidth && current) {
        wrapped.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current) {
      wrapped.push(current);
    }
  }

  return wrapped;
}

type RenderedLine = { text: string; gapAfter: number };

function expandLines(
  ctx: CanvasRenderingContext2D,
  lines: TextLine[],
  maxWidth: number,
  fontSize: number,
  bold: boolean,
): RenderedLine[] {
  const renderedLines: RenderedLine[] = [];

  for (const line of lines) {
    const colonIndex = line.text.indexOf("：");
    const prefix = colonIndex >= 0 ? line.text.slice(0, colonIndex + 1) : "";
    const body = colonIndex >= 0 ? line.text.slice(colonIndex + 1) : line.text;
    const prefixWidth = prefix ? ctx.measureText(prefix).width : 0;
    const wrapped = wrapParagraph(ctx, body, maxWidth - prefixWidth, fontSize, bold);

    wrapped.forEach((part, index) => {
      renderedLines.push({
        text: index === 0 ? `${prefix}${part}` : part,
        gapAfter: index === wrapped.length - 1 ? line.gapAfter ?? 0 : 0,
      });
    });
  }

  return renderedLines;
}

function measureTextBlockHeight(
  renderedLines: RenderedLine[],
  lineHeight: number,
): number {
  return renderedLines.reduce((sum, line) => sum + lineHeight + line.gapAfter, 0);
}

function drawCoverImageInRect(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

function drawRoundedCoverImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  drawCoverImageInRect(ctx, image, x, y, width, height);
  ctx.restore();
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  lines: TextLine[],
  box: { x: number; y: number; width: number; height: number },
  options: {
    fontSize: number;
    bold: boolean;
    align: "center" | "left";
    autoFit?: boolean;
  },
) {
  let fontSize = options.fontSize;
  let renderedLines: RenderedLine[] = [];
  let lineHeight = Math.round(fontSize * 1.35);

  if (options.autoFit) {
    while (fontSize >= 18) {
      ctx.font = fontSpec(fontSize, options.bold);
      renderedLines = expandLines(ctx, lines, box.width, fontSize, options.bold);
      lineHeight = Math.round(fontSize * 1.35);
      if (measureTextBlockHeight(renderedLines, lineHeight) <= box.height) {
        break;
      }
      fontSize -= 1;
    }
  } else {
    ctx.font = fontSpec(fontSize, options.bold);
    renderedLines = expandLines(ctx, lines, box.width, fontSize, options.bold);
  }

  const contentHeight = measureTextBlockHeight(renderedLines, lineHeight);
  let cursorY = box.y + Math.max(0, (box.height - contentHeight) / 2);

  ctx.fillStyle = "#1d1d1f";
  ctx.textBaseline = "top";
  ctx.font = fontSpec(fontSize, options.bold);

  for (const line of renderedLines) {
    if (options.align === "center") {
      ctx.textAlign = "center";
      ctx.fillText(line.text, box.x + box.width / 2, cursorY, box.width);
    } else {
      ctx.textAlign = "left";
      ctx.fillText(line.text, box.x, cursorY, box.width);
    }
    cursorY += lineHeight + line.gapAfter;
  }
}

function drawBottomThirdLayout(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  lines: TextLine[],
) {
  const photoHeight = Math.round(HEIGHT * (2 / 3));
  const textHeight = HEIGHT - photoHeight;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WIDTH, photoHeight);
  ctx.clip();
  drawCoverImageInRect(ctx, image, 0, 0, WIDTH, photoHeight);
  ctx.restore();

  const fade = ctx.createLinearGradient(0, photoHeight - 48, 0, photoHeight + 8);
  fade.addColorStop(0, "rgba(255,255,255,0)");
  fade.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, photoHeight - 48, WIDTH, 56);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, photoHeight, WIDTH, textHeight);

  drawTextBlock(
    ctx,
    lines,
    { x: 56, y: photoHeight + 28, width: WIDTH - 112, height: textHeight - 56 },
    { fontSize: 26, bold: true, align: "center", autoFit: true },
  );
}

function drawSplitLayout(ctx: CanvasRenderingContext2D, image: HTMLImageElement, lines: TextLine[]) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#eef6ff");
  gradient.addColorStop(1, "#f7fbf4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const padding = 40;
  const gap = 28;
  const photoWidth = Math.round(WIDTH * 0.4);
  const textPanelX = padding + photoWidth + gap;
  const textPanelWidth = WIDTH - textPanelX - padding;
  const innerHeight = HEIGHT - padding * 2;

  drawRoundedCoverImage(
    ctx,
    image,
    padding,
    padding,
    photoWidth,
    innerHeight,
    28,
  );

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(textPanelX, padding, textPanelWidth, innerHeight, 28);
  ctx.fill();

  drawTextBlock(
    ctx,
    lines,
    { x: textPanelX + 28, y: padding + 28, width: textPanelWidth - 56, height: innerHeight - 56 },
    { fontSize: 24, bold: true, align: "left", autoFit: true },
  );
}

function drawCircleLayout(ctx: CanvasRenderingContext2D, image: HTMLImageElement, lines: TextLine[]) {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#dbeafe");
  gradient.addColorStop(1, "#f5f3ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const diameter = 420;
  const circleX = WIDTH / 2;
  const circleY = 250;

  ctx.save();
  ctx.beginPath();
  ctx.arc(circleX, circleY, diameter / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const scale = Math.max(diameter / image.width, diameter / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, circleX - drawWidth / 2, circleY - drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(circleX, circleY, diameter / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(72, 520, WIDTH - 144, HEIGHT - 560, 24);
  ctx.fill();

  drawTextBlock(
    ctx,
    lines,
    { x: 96, y: 548, width: WIDTH - 192, height: HEIGHT - 600 },
    { fontSize: 26, bold: true, align: "center", autoFit: true },
  );
}

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("無法讀取照片"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function generatePreMeetingGraphicBlob(input: {
  photo: HTMLImageElement;
  form: PreMeetingGraphicInput;
  layout: PreMeetingGraphicLayout;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("無法建立畫布");
  }

  const lines = buildTextLines(input.form);
  switch (input.layout) {
    case "split":
      drawSplitLayout(ctx, input.photo, lines);
      break;
    case "circle":
      drawCircleLayout(ctx, input.photo, lines);
      break;
    case "bottom":
    default:
      drawBottomThirdLayout(ctx, input.photo, lines);
      break;
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("輸出圖片失敗"));
          return;
        }
        resolve(blob);
      },
      "image/png",
      1,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
