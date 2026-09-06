"use client";

import { useEffect } from "react";

/** Ensure iOS Add to Home Screen picks Life icons/name when on /life. */
export function LifePwaLinks() {
  useEffect(() => {
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) {
      manifest.setAttribute("href", "/life/manifest.webmanifest");
    } else {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/life/manifest.webmanifest";
      document.head.appendChild(link);
    }

    document
      .querySelectorAll('link[rel="apple-touch-icon"]')
      .forEach((n) => n.parentElement?.removeChild(n));
    const apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.sizes = "180x180";
    apple.href = "/life-icons/apple-touch-icon.png";
    document.head.appendChild(apple);

    let metaApp = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!metaApp) {
      metaApp = document.createElement("meta");
      metaApp.setAttribute("name", "apple-mobile-web-app-title");
      document.head.appendChild(metaApp);
    }
    metaApp.setAttribute("content", "Baki Life");
  }, []);

  return null;
}
