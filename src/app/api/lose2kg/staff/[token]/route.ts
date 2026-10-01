import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam } from "@/lib/lose2kg/staff-api";
import { readLose2kgStaffSessionCookie } from "@/lib/lose2kg/staff-session-cookie";
import { getStaffWorkstationInit } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Staff workstation single-init endpoint.
 * Unauthenticated → gate fields only.
 * Authenticated → gate + bootstrap in one response (no separate /bootstrap required).
 * Existing /bootstrap remains for compatibility.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    const raw = await readLose2kgStaffSessionCookie();
    const init = await getStaffWorkstationInit({
      staffToken,
      rawSessionToken: raw,
    });
    return NextResponse.json({
      ok: true,
      periodId: init.periodId,
      periodName: init.periodName,
      status: init.status,
      authenticated: init.authenticated,
      ...(init.bootstrap ? { data: init.bootstrap } : {}),
    });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
