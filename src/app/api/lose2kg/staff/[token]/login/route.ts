import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam } from "@/lib/lose2kg/staff-api";
import { setLose2kgStaffSessionCookie } from "@/lib/lose2kg/staff-session-cookie";
import { loginStaffWorkstation } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    const body = (await request.json()) as { password?: string };
    const result = await loginStaffWorkstation({
      staffToken,
      password: body.password ?? "",
    });
    await setLose2kgStaffSessionCookie(result.rawSessionToken);
    return NextResponse.json({
      ok: true,
      periodId: result.periodId,
      periodName: result.periodName,
    });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
