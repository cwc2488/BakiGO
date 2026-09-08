import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { voidFormalDraw } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ drawId: string }> },
) {
  try {
    const memberId = await requireLose2kgAdmin(request);
    const { drawId } = await context.params;
    const body = (await request.json()) as { reason?: string };
    const draw = await voidFormalDraw({
      drawId,
      reason: body.reason ?? "",
      voidedByMemberId: memberId,
    });
    return NextResponse.json({ ok: true, draw });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
