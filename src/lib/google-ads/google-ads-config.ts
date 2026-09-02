/**
 * Google Ads IDs for Transformation funnel tracking.
 * Do not invent conversion labels — set NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL
 * only after creating the conversion action in Google Ads.
 */

export const GOOGLE_ADS_ID = "AW-18416279889";

export function readGoogleAdsId(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "").trim();
  return fromEnv || GOOGLE_ADS_ID;
}

/** Event-specific conversion label (the part after AW-XXXXXXXX/…). Empty until configured. */
export function readGoogleAdsTransformConversionLabel(): string {
  return (process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL ?? "").trim();
}

export function buildGoogleAdsTransformSendTo(): string | null {
  const id = readGoogleAdsId();
  const label = readGoogleAdsTransformConversionLabel();
  if (!id || !label) return null;
  return `${id}/${label}`;
}
