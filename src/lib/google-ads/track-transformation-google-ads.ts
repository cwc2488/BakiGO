/**
 * Google Ads conversion events for Transformation funnel.
 * Requires GoogleAdsTag mounted on the /transform layout.
 * Never throws — tracking must not block UX.
 * Never includes PII.
 *
 * Fires only when NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL is set.
 * Semantics mirror Meta Lead: successful non-duplicate submit only.
 */

import {
  buildGoogleAdsTransformSendTo,
  readGoogleAdsId,
} from "@/lib/google-ads/google-ads-config";

const CONVERSION_KEY_PREFIX = "baki:transformation-google-ads-conversion:";

function gtagReady(): boolean {
  if (typeof window === "undefined") return false;
  if (!readGoogleAdsId()) return false;
  return typeof window.gtag === "function";
}

/**
 * Fire Google Ads conversion once per successful new Transformation Lead.
 * Returns false when label missing, gtag not ready, duplicate call, or error.
 */
export function trackTransformationGoogleAdsConversionOnce(submissionId: string): boolean {
  const sendTo = buildGoogleAdsTransformSendTo();
  if (!sendTo) return false;
  if (!gtagReady()) return false;
  if (!submissionId.trim()) return false;

  const key = `${CONVERSION_KEY_PREFIX}${submissionId}`;
  try {
    if (sessionStorage.getItem(key) === "1") return false;
  } catch {
    /* private mode */
  }

  try {
    window.gtag?.("event", "conversion", {
      send_to: sendTo,
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
