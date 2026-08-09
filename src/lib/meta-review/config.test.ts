import { describe, expect, it } from "vitest";
import { getMetaReviewRedirectUri, PRODUCTION_META_REVIEW_REDIRECT_URI } from "./config";

describe("meta-review config", () => {
  it("uses bakigo.tw redirect URI for production origins", () => {
    expect(getMetaReviewRedirectUri("https://bakigo.tw")).toBe(PRODUCTION_META_REVIEW_REDIRECT_URI);
    expect(getMetaReviewRedirectUri("https://baki-go.vercel.app")).toBe(
      PRODUCTION_META_REVIEW_REDIRECT_URI,
    );
  });

  it("keeps localhost redirect URI unchanged for local development", () => {
    expect(getMetaReviewRedirectUri("http://localhost:3000")).toBe(
      "http://localhost:3000/api/meta-review/auth/callback",
    );
    expect(getMetaReviewRedirectUri("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000/api/meta-review/auth/callback",
    );
  });
});
