import type {
  CustomerPhotoAngle,
  CustomerPhotoPhase,
  CustomerProgressPhoto,
} from "@/types/customer";

export interface PhotoComparePair {
  angle: CustomerPhotoAngle;
  before: CustomerProgressPhoto;
  after: CustomerProgressPhoto;
}

function latestPhoto(
  photos: CustomerProgressPhoto[],
  phase: CustomerPhotoPhase,
  angle: CustomerPhotoAngle,
): CustomerProgressPhoto | undefined {
  return photos
    .filter((photo) => photo.phase === phase && photo.angle === angle && photo.imageDataUrl)
    .sort((left, right) => right.photoDate.localeCompare(left.photoDate))[0];
}

export function findPhotoComparePairs(photos: CustomerProgressPhoto[]): PhotoComparePair[] {
  const angles: CustomerPhotoAngle[] = ["front", "side", "back"];

  return angles.flatMap((angle) => {
    const before = latestPhoto(photos, "before", angle);
    const after = latestPhoto(photos, "after", angle);
    if (!before || !after) {
      return [];
    }
    return [{ angle, before, after }];
  });
}

export async function renderPhotoCompareImage(input: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel: string;
  afterLabel: string;
  customerName: string;
}): Promise<string> {
  const [beforeImage, afterImage] = await Promise.all([
    loadImage(input.beforeSrc),
    loadImage(input.afterSrc),
  ]);

  const cellWidth = 480;
  const cellHeight = 640;
  const headerHeight = 72;
  const labelHeight = 40;
  const canvas = document.createElement("canvas");
  canvas.width = cellWidth * 2 + 24;
  canvas.height = headerHeight + cellHeight + labelHeight + 24;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("無法產生對照圖");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#1d1d1f";
  context.font = "600 28px system-ui, sans-serif";
  context.fillText(`${input.customerName} · 使用前 / 使用後`, 24, 44);

  drawImageCover(context, beforeImage, 12, headerHeight + 12, cellWidth, cellHeight);
  drawImageCover(context, afterImage, cellWidth + 24, headerHeight + 12, cellWidth, cellHeight);

  context.fillStyle = "#636366";
  context.font = "500 22px system-ui, sans-serif";
  context.fillText(input.beforeLabel, 24, headerHeight + cellHeight + 36);
  context.fillText(input.afterLabel, cellWidth + 36, headerHeight + cellHeight + 36);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法載入照片，請重新上傳"));
    image.src = src;
  });
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (width - drawWidth) / 2;
  const offsetY = y + (height - drawHeight) / 2;

  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 20);
  context.clip();
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  context.restore();
}
