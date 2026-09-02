"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
      push?: (...args: unknown[]) => void;
    };
    _fbq?: Window["fbq"];
    __bakiMetaPixelInitialized?: boolean;
  }
}

function readPixelId(): string {
  return (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();
}

/**
 * META-PIXEL-01 — Public Quiz consumer-only.
 * Mount only from public quiz layouts. No-ops when Pixel ID is unset.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const pixelId = readPixelId();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pixelId) return;

    let cancelled = false;
    let intervalId = 0;
    let timeoutId = 0;

    const tryTrack = (): boolean => {
      if (cancelled) return true;
      if (typeof window.fbq !== "function") return false;
      if (lastTrackedPath.current === pathname) return true;
      lastTrackedPath.current = pathname;
      window.fbq("track", "PageView");
      return true;
    };

    if (tryTrack()) return;

    intervalId = window.setInterval(() => {
      if (tryTrack()) window.clearInterval(intervalId);
    }, 50);
    timeoutId = window.setTimeout(() => window.clearInterval(intervalId), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [pathname, pixelId]);

  if (!pixelId) return null;

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
if(!window.__bakiMetaPixelInitialized){
  fbq('init', ${JSON.stringify(pixelId)});
  window.__bakiMetaPixelInitialized = true;
}
          `.trim(),
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height={1}
          width={1}
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
