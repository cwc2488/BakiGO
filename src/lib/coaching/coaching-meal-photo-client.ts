const MAX_MEAL_PHOTO_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export async function resizeMealPhotoToJpegBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("請選擇圖片檔案");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_MEAL_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("無法處理圖片");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) {
    throw new Error("無法壓縮圖片");
  }

  return blob;
}

export async function uploadCoachingMealPhotoWithRetry(input: {
  token: string;
  logDate: string;
  mealSlot: string;
  file: File;
  maxAttempts?: number;
}): Promise<{ storagePath: string; mealEntryId: string }> {
  const blob = await resizeMealPhotoToJpegBlob(input.file);
  const maxAttempts = input.maxAttempts ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const formData = new FormData();
      formData.append("logDate", input.logDate);
      formData.append("photo", blob, `${input.mealSlot}.jpg`);

      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(input.token)}/meals/${encodeURIComponent(input.mealSlot)}/photo`, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { ok?: boolean; storagePath?: string; mealEntryId?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.storagePath || !payload.mealEntryId) {
        throw new Error(payload.error ?? "照片上傳失敗");
      }

      return {
        storagePath: payload.storagePath,
        mealEntryId: payload.mealEntryId,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("照片上傳失敗");
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }
    }
  }

  throw lastError ?? new Error("照片上傳失敗");
}
