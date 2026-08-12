import { createHash, randomBytes } from "node:crypto";

/** ≥128 bits of entropy; URL-safe; never store plaintext in DB. */
export function generateGrowthShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGrowthShareToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function isPlausibleGrowthShareToken(token: string): boolean {
  const trimmed = token.trim();
  // base64url of 32 bytes ≈ 43 chars; reject short guessable codes
  return trimmed.length >= 32 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}
