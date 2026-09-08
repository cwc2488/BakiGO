import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { getStaffBootstrap } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    const { periodId } = await requireStaffFromRequest(staffToken);
    const data = await getStaffBootstrap(periodId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
