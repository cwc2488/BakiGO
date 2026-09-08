import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { createParticipant } from "@/lib/lose2kg/service";
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
      name?: string;
      publicDisplayName?: string;
      note?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "請填寫姓名。" }, { status: 400 });
    }
    const participant = await createParticipant({
      periodId,
      name: body.name,
      publicDisplayName: body.publicDisplayName,
      note: body.note,
    });
    return NextResponse.json({ ok: true, participant });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
