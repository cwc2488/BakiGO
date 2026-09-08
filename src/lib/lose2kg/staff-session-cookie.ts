import {
  generateStaffSessionToken,
  hashStaffSessionToken,
  LOSE2KG_STAFF_SESSION_COOKIE,
  LOSE2KG_STAFF_SESSION_HOURS,
} from "@/lib/lose2kg/staff-auth";
import { cookies } from "next/headers";

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function setLose2kgStaffSessionCookie(rawToken: string): Promise<void> {
  const maxAge = LOSE2KG_STAFF_SESSION_HOURS * 60 * 60;
  (await cookies()).set(LOSE2KG_STAFF_SESSION_COOKIE, rawToken, cookieOptions(maxAge));
}

export async function clearLose2kgStaffSessionCookie(): Promise<void> {
  (await cookies()).set(LOSE2KG_STAFF_SESSION_COOKIE, "", {
    ...cookieOptions(0),
    maxAge: 0,
  });
}

export async function readLose2kgStaffSessionCookie(): Promise<string | null> {
  const value = (await cookies()).get(LOSE2KG_STAFF_SESSION_COOKIE)?.value;
  return value?.trim() || null;
}

export function mintStaffSessionToken(): { raw: string; hash: string } {
  const raw = generateStaffSessionToken();
  return { raw, hash: hashStaffSessionToken(raw) };
}
