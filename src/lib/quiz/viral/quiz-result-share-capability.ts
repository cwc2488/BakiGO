export function canShareResultImageFile(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    const probe = new File([new Blob(["x"], { type: "image/png" })], "probe.png", {
      type: "image/png",
    });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function isNativeShareAbort(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "AbortError";
}

/** OS share sheet resolved. Never claim Instagram Story posted. */
export const NATIVE_SHARE_COMPLETED_EVENT = "native_share_completed" as const;
