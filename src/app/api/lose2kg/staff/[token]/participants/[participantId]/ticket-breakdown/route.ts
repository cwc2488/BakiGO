import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { getTicketBreakdownForParticipant } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; participantId: string }> },
) {
  try {
    const { token, participantId } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    await requireStaffFromRequest(staffToken);
    const breakdown = await getTicketBreakdownForParticipant({
      participantId,
      showWeights: true,
    });
    return NextResponse.json({ ok: true, breakdown });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
