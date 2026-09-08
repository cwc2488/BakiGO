import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { createTempDrawSession } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    const memberId = await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const body = (await request.json()) as { presentParticipantIds?: string[] };
    const result = await createTempDrawSession({
      periodId,
      createdByMemberId: memberId,
      presentParticipantIds: body.presentParticipantIds ?? [],
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
