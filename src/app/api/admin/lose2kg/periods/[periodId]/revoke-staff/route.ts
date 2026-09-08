import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { revokeAllStaffSessions } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    await revokeAllStaffSessions(periodId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
