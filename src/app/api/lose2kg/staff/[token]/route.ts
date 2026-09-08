import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam } from "@/lib/lose2kg/staff-api";
import { getStaffGateInfo } from "@/lib/lose2kg/v2-service";
import { readLose2kgStaffSessionCookie } from "@/lib/lose2kg/staff-session-cookie";
import { resolveStaffSession } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    const info = await getStaffGateInfo(staffToken);
    const raw = await readLose2kgStaffSessionCookie();
    const session = await resolveStaffSession(raw);
    const authenticated = Boolean(session && session.periodId === info.periodId);
    return NextResponse.json({ ok: true, ...info, authenticated });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
