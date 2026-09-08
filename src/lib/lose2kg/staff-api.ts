import { Lose2kgError } from "@/lib/lose2kg/api";
import { readLose2kgStaffSessionCookie } from "@/lib/lose2kg/staff-session-cookie";
import { requireStaffPeriodAccess } from "@/lib/lose2kg/v2-service";
import type { Lose2kgPeriod } from "@/types/lose2kg";

export async function requireStaffFromRequest(
  staffToken: string,
): Promise<{ periodId: string; period: Lose2kgPeriod }> {
  const raw = await readLose2kgStaffSessionCookie();
  return requireStaffPeriodAccess({ staffToken, rawSessionToken: raw });
}

export function assertStaffTokenParam(token: string): string {
  if (!token || token.length < 16) {
    throw new Lose2kgError("無效工作站連結。", 404, "not_found");
  }
  return token;
}
