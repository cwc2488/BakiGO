import { describe, expect, it } from "vitest";
import {
  generateAnalysisSessionToken,
  hashAnalysisSessionToken,
  isPlausibleAnalysisSessionToken,
} from "@/lib/analysis/analysis-session-token";

describe("analysis session token", () => {
  it("generates opaque URL-safe tokens of sufficient entropy", () => {
    const a = generateAnalysisSessionToken();
    const b = generateAnalysisSessionToken();
    expect(a).not.toBe(b);
    expect(isPlausibleAnalysisSessionToken(a)).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("hashes deterministically and never equals plaintext", () => {
    const token = generateAnalysisSessionToken();
    const hash = hashAnalysisSessionToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
    expect(hashAnalysisSessionToken(token)).toBe(hash);
  });

  it("rejects short or non-base64url tokens", () => {
    expect(isPlausibleAnalysisSessionToken("short")).toBe(false);
    expect(isPlausibleAnalysisSessionToken("!!!!")).toBe(false);
    expect(isPlausibleAnalysisSessionToken("a".repeat(40))).toBe(true);
  });
});
