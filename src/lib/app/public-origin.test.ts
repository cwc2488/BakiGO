import { afterEach, describe, expect, it } from "vitest";
import {
  PRODUCTION_APP_ORIGIN,
  buildPublicShareUrl,
  getPublicAppOrigin,
  getPublicShareOrigin,
  isLocalDevOrigin,
  isVercelPreviewOrigin,
} from "./public-origin";

describe("public-origin", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("detects local development origins", () => {
    expect(isLocalDevOrigin("http://localhost:3000")).toBe(true);
    expect(isLocalDevOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isLocalDevOrigin("https://bakigo.tw")).toBe(false);
  });

  it("detects vercel preview origins", () => {
    expect(isVercelPreviewOrigin("https://baki-go-git-feature.vercel.app")).toBe(true);
    expect(isVercelPreviewOrigin("https://baki-go.vercel.app")).toBe(false);
  });

  it("uses configured NEXT_PUBLIC_APP_URL when present", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bakigo.tw/";
    expect(getPublicAppOrigin("https://baki-go.vercel.app")).toBe("https://bakigo.tw");
  });

  it("uses canonical production origin for production vercel host", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    expect(getPublicAppOrigin("https://baki-go.vercel.app")).toBe(PRODUCTION_APP_ORIGIN);
  });

  it("preserves localhost origin in development", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL;
    expect(getPublicAppOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("preserves preview deployment origins", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "preview";
    expect(getPublicAppOrigin("https://baki-go-git-feature.vercel.app")).toBe(
      "https://baki-go-git-feature.vercel.app",
    );
  });

  it("builds canonical share urls for production hostnames", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    expect(getPublicShareOrigin("https://baki-go.vercel.app")).toBe(PRODUCTION_APP_ORIGIN);
    expect(buildPublicShareUrl("/q/ABC123", "https://baki-go.vercel.app")).toBe(
      "https://bakigo.tw/q/ABC123",
    );
  });
});
