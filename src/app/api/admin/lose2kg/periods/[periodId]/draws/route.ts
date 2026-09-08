import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { executeFormalDraw } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    const memberId = await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const body = (await request.json()) as { prizeId?: string; idempotencyKey?: string };
    if (!body.prizeId) {
      return NextResponse.json({ error: "請選擇獎項。" }, { status: 400 });
    }
    const result = await executeFormalDraw({
      periodId,
      prizeId: body.prizeId,
      drawnByMemberId: memberId,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
