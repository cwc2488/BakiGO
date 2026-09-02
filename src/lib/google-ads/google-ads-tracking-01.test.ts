import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GOOGLE_ADS_ID,
  buildGoogleAdsTransformSendTo,
  readGoogleAdsId,
  readGoogleAdsTransformConversionLabel,
} from "./google-ads-config";
import { trackTransformationGoogleAdsConversionOnce } from "./track-transformation-google-ads";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("GOOGLE-ADS-TRACKING-01", () => {
  const previousId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const previousLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL;
  });

  afterEach(() => {
    if (previousId === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
    else process.env.NEXT_PUBLIC_GOOGLE_ADS_ID = previousId;
    if (previousLabel === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL;
    else process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL = previousLabel;
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis as { sessionStorage?: unknown }, "sessionStorage");
  });

  it("uses AW-18416279889 as the default Google Ads ID", () => {
    expect(GOOGLE_ADS_ID).toBe("AW-18416279889");
    expect(readGoogleAdsId()).toBe("AW-18416279889");
  });

  it("does not invent a conversion label and blocks send_to without one", () => {
    expect(readGoogleAdsTransformConversionLabel()).toBe("");
    expect(buildGoogleAdsTransformSendTo()).toBeNull();
    process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL = "AbCdEfGhIjKlMnOp";
    expect(buildGoogleAdsTransformSendTo()).toBe("AW-18416279889/AbCdEfGhIjKlMnOp");
  });

  it("mounts Google Ads base tag on transform layout only", () => {
    expect(src("src/app/transform/[code]/layout.tsx")).toContain("GoogleAdsTag");
    expect(src("src/components/google-ads/GoogleAdsTag.tsx")).toContain("gtag('config'");
    expect(src("src/lib/google-ads/google-ads-config.ts")).toContain("AW-18416279889");
    expect(src("src/app/layout.tsx")).not.toContain("GoogleAdsTag");
    expect(src("src/app/admin/layout.tsx")).not.toContain("GoogleAdsTag");
    expect(src("src/app/quiz/fat-loss/layout.tsx")).not.toContain("GoogleAdsTag");
    expect(src("src/app/join/[code]/layout.tsx")).not.toContain("GoogleAdsTag");
  });

  it("preserves Meta Pixel mount on transform and Lead success boundary", () => {
    expect(src("src/app/transform/[code]/layout.tsx")).toContain("MetaPixel");
    const landing = src("src/components/transformation/TransformationLandingPage.tsx");
    expect(landing).toContain("trackTransformationLeadOnce");
    expect(landing).toContain("trackTransformationGoogleAdsConversionOnce");
    expect(landing).toContain("!payload.duplicateOfExisting");
  });

  it("fires Google conversion once only when label is configured", () => {
    process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL = "TestLabel123";
    expect(buildGoogleAdsTransformSendTo()).toBe("AW-18416279889/TestLabel123");

    const store = new Map<string, string>();
    const calls: unknown[][] = [];
    const fakeWindow = {
      gtag: (...args: unknown[]) => {
        calls.push(args);
      },
    };
    Object.defineProperty(globalThis, "window", {
      value: fakeWindow,
      configurable: true,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      configurable: true,
    });

    expect(trackTransformationGoogleAdsConversionOnce("lead-1")).toBe(true);
    expect(trackTransformationGoogleAdsConversionOnce("lead-1")).toBe(false);

    delete process.env.NEXT_PUBLIC_GOOGLE_ADS_TRANSFORMATION_CONVERSION_LABEL;
    expect(trackTransformationGoogleAdsConversionOnce("lead-2")).toBe(false);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("event");
    expect(calls[0]?.[1]).toBe("conversion");
    expect(calls[0]?.[2]).toEqual({ send_to: "AW-18416279889/TestLabel123" });
  });

  it("does not add gclid persistence without a schema column / migration", () => {
    const migration = src("supabase/migrations/062_transformation_funnel_v1.sql");
    expect(migration).toContain("fbclid text");
    expect(migration).not.toContain("gclid");
    expect(src("src/lib/transformation/transformation-utm.ts")).not.toContain("gclid");
    expect(src("src/lib/transformation/transformation-contract.ts")).not.toContain("gclid");
  });
});
