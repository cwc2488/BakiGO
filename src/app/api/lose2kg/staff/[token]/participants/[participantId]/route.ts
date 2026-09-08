import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { updateParticipant } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Staff may edit names or soft-withdraw. Hard delete of period is Admin-only. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string; participantId: string }> },
) {
  try {
    const { token, participantId } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    await requireStaffFromRequest(staffToken);
    const body = (await request.json()) as {
      name?: string;
      publicDisplayName?: string;
      note?: string | null;
      status?: "active" | "withdrawn";
    };
    const participant = await updateParticipant(participantId, {
      name: body.name,
      publicDisplayName: body.publicDisplayName,
      note: body.note,
      status: body.status,
    });
    return NextResponse.json({ ok: true, participant });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
