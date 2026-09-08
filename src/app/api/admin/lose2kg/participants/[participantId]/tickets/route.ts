import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { adjustActivityTickets } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ participantId: string }> },
) {
  try {
    const memberId = await requireLose2kgAdmin(request);
    const { participantId } = await context.params;
    const body = (await request.json()) as {
      delta?: number;
      reason?: string;
      eventDate?: string;
    };
    if (!Number.isInteger(body.delta) || body.delta === 0) {
      return NextResponse.json({ error: "票數必須是非零整數。" }, { status: 400 });
    }
    if (!body.reason?.trim()) {
      return NextResponse.json({ error: "請填寫原因。" }, { status: 400 });
    }
    const participant = await adjustActivityTickets({
      participantId,
      delta: body.delta!,
      reason: body.reason,
      eventDate: body.eventDate,
      createdByMemberId: memberId,
    });
    return NextResponse.json({ ok: true, participant });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
