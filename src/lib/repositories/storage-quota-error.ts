const STORAGE_QUOTA_USER_MESSAGE =
  "本機儲存空間不足，請清除瀏覽器網站資料後再試。若問題持續，請聯絡支援。";

export function isStorageQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  return error.name === "QuotaExceededError" || error.code === 22;
}

export function toStorageUserError(error: unknown): Error {
  if (isStorageQuotaError(error)) {
    return new Error(STORAGE_QUOTA_USER_MESSAGE);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("儲存失敗，請稍後再試");
}

export function rethrowStorageUserError(error: unknown): never {
  throw toStorageUserError(error);
}
