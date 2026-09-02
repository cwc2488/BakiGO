/**
 * Meta Pixel events for Transformation funnel.
 * Requires MetaPixel already mounted on the /transform layout.
 * Never throws — tracking must not block UX.
 * Never includes PII in event parameters.
 */

const FORM_START_KEY = "baki:transformation-form-start:v1";
const LEAD_KEY_PREFIX = "baki:transformation-lead:";

function pixelReady(): boolean {
  if (typeof window === "undefined") return false;
  const pixelId = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();
  if (!pixelId) return false;
  return typeof window.fbq === "function";
}

function getFbq(): ((...args: unknown[]) => void) | null {
  if (!pixelReady()) return null;
  return window.fbq ?? null;
}

export function trackTransformationViewContent(input: {
  landingPageVersion: string;
  shareCode: string;
}): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  try {
    fbq("track", "ViewContent", {
      content_name: "transformation_landing",
      landing_page_version: input.landingPageVersion,
      funnel: "transformation",
      share_code: input.shareCode,
    });
    return true;
  } catch {
    return false;
  }
}

export function trackTransformationFormStartOnce(): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  try {
    if (sessionStorage.getItem(FORM_START_KEY) === "1") return false;
  } catch {
    /* private mode */
  }
  try {
    fbq("trackCustom", "TransformationFormStart", {
      funnel: "transformation",
    });
    try {
      sessionStorage.setItem(FORM_START_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

export function trackTransformationLeadOnce(submissionId: string): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  const key = `${LEAD_KEY_PREFIX}${submissionId}`;
  try {
    if (sessionStorage.getItem(key) === "1") return false;
  } catch {
    /* private mode */
  }
  try {
    fbq("track", "Lead", {
      funnel: "transformation",
    });
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
