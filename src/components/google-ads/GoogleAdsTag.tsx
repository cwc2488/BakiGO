"use client";

import Script from "next/script";
import { readGoogleAdsId } from "@/lib/google-ads/google-ads-config";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __bakiGoogleAdsInitialized?: boolean;
  }
}

/**
 * Google Ads base tag (gtag config).
 * Mount from public Transformation layout only — not Admin/Radar/Coaching.
 * No-ops when Ads ID is unset. Init guard prevents duplicate config.
 */
export function GoogleAdsTag() {
  const adsId = readGoogleAdsId();
  if (!adsId) return null;

  return (
    <>
      <Script
        id="google-ads-gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-ads-gtag-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('js', new Date());
if(!window.__bakiGoogleAdsInitialized){
  gtag('config', ${JSON.stringify(adsId)});
  window.__bakiGoogleAdsInitialized = true;
}
          `.trim(),
        }}
      />
    </>
  );
}
