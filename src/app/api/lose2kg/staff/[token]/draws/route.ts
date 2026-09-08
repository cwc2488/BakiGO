import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { staffExecuteFormalDraw } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    const { periodId } = await requireStaffFromRequest(staffToken);
    const body = (await request.json()) as { prizeId?: string; idempotencyKey?: string };
    if (!body.prizeId) {
      return NextResponse.json({ error: "請選擇獎項。" }, { status: 400 });
    }
    const result = await staffExecuteFormalDraw({
      periodId,
      prizeId: body.prizeId,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
