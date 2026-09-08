import { createHash, randomBytes } from "node:crypto";

export function generateLose2kgPublicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashLose2kgPublicToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function normalizeLose2kgToken(token: string | null | undefined): string | null {
  const value = (token ?? "").trim();
  if (value.length < 16 || value.length > 128) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  return value;
}
