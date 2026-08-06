export const AVATAR_OUTPUT_SIZES = [
  { label: "小", value: 256 },
  { label: "標準", value: 512 },
  { label: "大", value: 768 },
] as const;

export type AvatarOutputSize = (typeof AVATAR_OUTPUT_SIZES)[number]["value"];

export function resolveMinCoverScale(
  imageWidth: number,
  imageHeight: number,
  viewportSize: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return 1;
  }
  return Math.max(viewportSize / imageWidth, viewportSize / imageHeight);
}

export function clampPan(input: {
  panX: number;
  panY: number;
  imageWidth: number;
  imageHeight: number;
  scale: number;
  viewportSize: number;
}): { panX: number; panY: number } {
  const displayWidth = input.imageWidth * input.scale;
  const displayHeight = input.imageHeight * input.scale;

  function clampAxis(pan: number, display: number): number {
    if (display <= input.viewportSize) {
      return (input.viewportSize - display) / 2;
    }
    const min = input.viewportSize - display;
    const max = 0;
    return Math.min(max, Math.max(min, pan));
  }

  return {
    panX: clampAxis(input.panX, displayWidth),
    panY: clampAxis(input.panY, displayHeight),
  };
}

export function centerPan(input: {
  imageWidth: number;
  imageHeight: number;
  scale: number;
  viewportSize: number;
}): { panX: number; panY: number } {
  return clampPan({
    panX: (input.viewportSize - input.imageWidth * input.scale) / 2,
    panY: (input.viewportSize - input.imageHeight * input.scale) / 2,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    scale: input.scale,
    viewportSize: input.viewportSize,
  });
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法載入圖片"));
    image.src = src;
  });
}

export async function cropImageToJpegBlob(input: {
  image: HTMLImageElement;
  viewportSize: number;
  scale: number;
  panX: number;
  panY: number;
  outputSize: number;
  quality?: number;
}): Promise<Blob> {
  const sourceX = -input.panX / input.scale;
  const sourceY = -input.panY / input.scale;
  const sourceSize = input.viewportSize / input.scale;

  const canvas = document.createElement("canvas");
  canvas.width = input.outputSize;
  canvas.height = input.outputSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("無法處理圖片");
  }

  context.drawImage(
    input.image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    input.outputSize,
    input.outputSize,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", input.quality ?? 0.9);
  });

  if (!blob) {
    throw new Error("無法輸出裁切結果");
  }

  return blob;
}
