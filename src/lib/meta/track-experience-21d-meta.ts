/**
 * Meta Pixel events for 21-day Experience landing.
 * Requires MetaPixel on /experience/21d layout. Never throws. No PII.
 */

const VIEW_KEY = "baki:experience-21d-view:v1";
const FORM_START_KEY = "baki:experience-21d-form-start:v1";
const METHOD_KEY_PREFIX = "baki:experience-21d-method:";
const LEAD_KEY_PREFIX = "baki:experience-21d-lead:";

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

export function trackExperience21dLandingViewOnce(input: {
  landingPageVersion: string;
}): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  try {
    if (sessionStorage.getItem(VIEW_KEY) === "1") return false;
  } catch {
    /* private mode */
  }
  try {
    fbq("track", "ViewContent", {
      content_name: "experience_21d_landing",
      landing_page_version: input.landingPageVersion,
      funnel: "experience_21d",
    });
    try {
      sessionStorage.setItem(VIEW_KEY, "1");
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

export function trackExperience21dFormStartOnce(): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  try {
    if (sessionStorage.getItem(FORM_START_KEY) === "1") return false;
  } catch {
    /* private mode */
  }
  try {
    fbq("trackCustom", "Experience21dFormStart", { funnel: "experience_21d" });
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

export function trackExperience21dMethodSelectedOnce(method: string): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  const key = `${METHOD_KEY_PREFIX}${method}`;
  try {
    if (sessionStorage.getItem(key) === "1") return false;
  } catch {
    /* private mode */
  }
  try {
    fbq("trackCustom", "Experience21dMethodSelected", {
      funnel: "experience_21d",
      consultation_preference: method,
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

export function trackExperience21dLeadOnce(submissionKey: string): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  const key = `${LEAD_KEY_PREFIX}${submissionKey}`;
  try {
    if (sessionStorage.getItem(key) === "1") return false;
  } catch {
    /* private mode */
  }
  try {
    fbq("track", "Lead", { funnel: "experience_21d" });
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
