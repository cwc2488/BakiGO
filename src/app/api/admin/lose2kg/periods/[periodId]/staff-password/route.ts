import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { updateStaffPassword } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const body = (await request.json()) as { password?: string };
    const period = await updateStaffPassword(periodId, body.password ?? "");
    return NextResponse.json({ ok: true, period });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
