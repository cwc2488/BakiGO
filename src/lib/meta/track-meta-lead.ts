/**
 * Fire Meta Pixel Lead once per successful recruitment submission id.
 * Requires MetaPixel already mounted on the recruitment public layout.
 * Never throws — tracking must not block UX.
 */
export function trackMetaLeadOnce(submissionId: string): boolean {
  if (typeof window === "undefined") return false;
  const pixelId = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();
  if (!pixelId) return false;
  const key = `baki:meta-lead:${submissionId}`;
  try {
    if (sessionStorage.getItem(key) === "1") return false;
  } catch {
    /* private mode */
  }
  if (typeof window.fbq !== "function") return false;
  try {
    window.fbq("track", "Lead");
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}
