import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const STAFF_PASSWORD_PEPPER = "baki-go-lose2kg-staff-v1";

/** 4–8 alphanumeric characters. */
export function isValidStaffPassword(password: string): boolean {
  return /^[A-Za-z0-9]{4,8}$/.test(password);
}

export function hashStaffPassword(password: string): string {
  return createHash("sha256")
    .update(`${STAFF_PASSWORD_PEPPER}:${password}`, "utf8")
    .digest("hex");
}

export function verifyStaffPassword(password: string, passwordHash: string): boolean {
  const next = Buffer.from(hashStaffPassword(password), "utf8");
  const expected = Buffer.from(passwordHash, "utf8");
  if (next.length !== expected.length) return false;
  return timingSafeEqual(next, expected);
}

export function generateStaffSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashStaffSessionToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export const LOSE2KG_STAFF_SESSION_COOKIE = "lose2kg_staff_session";
export const LOSE2KG_STAFF_SESSION_HOURS = 10;
