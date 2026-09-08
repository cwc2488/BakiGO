import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { createTempDrawSession, executePublicTempDraw } from "@/lib/lose2kg/service";
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
    const body = (await request.json()) as {
      presentParticipantIds?: string[];
      action?: "create" | "execute";
      tempToken?: string;
    };

    if (body.action === "execute" && body.tempToken) {
      const result = await executePublicTempDraw(body.tempToken);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await createTempDrawSession({
      periodId,
      createdByMemberId: null,
      presentParticipantIds: body.presentParticipantIds ?? [],
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
