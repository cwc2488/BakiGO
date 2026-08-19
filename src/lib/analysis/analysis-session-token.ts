import { createHash, randomBytes } from "node:crypto";

/** ≥128 bits; URL-safe; never store plaintext in DB. */
export function generateAnalysisSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAnalysisSessionToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function isPlausibleAnalysisSessionToken(token: string): boolean {
  const trimmed = token.trim();
  return trimmed.length >= 32 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}
