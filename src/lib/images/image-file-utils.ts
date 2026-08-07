const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_JPEG_QUALITY = 0.88;

export async function readImageFileAsJpegDataUrl(
  file: File,
  options?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("無法讀取這張照片，請改用 JPG／PNG，或在 iPhone 設定改為「最相容」格式");
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("無法處理圖片");
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (!dataUrl.startsWith("data:image/jpeg")) {
      throw new Error("無法轉換圖片格式");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] ?? "image/jpeg";
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function canSaveImageToPhotoLibrary(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) {
    return false;
  }

  try {
    const probe = new File([new Blob(["x"], { type: "image/jpeg" })], "probe.jpg", {
      type: "image/jpeg",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function saveImageBlobToPhotoLibrary(
  blob: Blob,
  filename: string,
): Promise<"photo-library" | "download"> {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename.replace(/\.(jpe?g|png)$/i, "") });
    return "photo-library";
  }

  downloadBlob(blob, filename);
  return "download";
}

export async function saveDataUrlToPhotoLibrary(
  dataUrl: string,
  filename: string,
): Promise<"photo-library" | "download"> {
  return saveImageBlobToPhotoLibrary(dataUrlToBlob(dataUrl), filename);
}

export function getSaveToPhotoLibraryLabel(): string {
  return canSaveImageToPhotoLibrary() ? "儲存到照片庫" : "下載圖片";
}

export function getSaveToPhotoLibrarySuccessMessage(method: "photo-library" | "download"): string {
  return method === "photo-library"
    ? "請在分享選單選「儲存影像」，即可加入照片庫"
    : "圖片已下載";
}
