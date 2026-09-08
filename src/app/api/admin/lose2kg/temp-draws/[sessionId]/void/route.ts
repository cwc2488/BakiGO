import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { voidTempDrawSession } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const memberId = await requireLose2kgAdmin(request);
    const { sessionId } = await context.params;
    const body = (await request.json()) as { reason?: string };
    const session = await voidTempDrawSession({
      sessionId,
      reason: body.reason ?? "",
      voidedByMemberId: memberId,
    });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
