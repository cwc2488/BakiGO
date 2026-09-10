import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { adjustActivityTickets, getParticipantDetail } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    await requireStaffFromRequest(staffToken);
    const body = (await request.json()) as {
      participantId?: string;
      delta?: number;
      reason?: string;
      eventDate?: string;
    };
    if (!body.participantId || !Number.isInteger(body.delta) || !body.delta) {
      return NextResponse.json({ error: "參數無效。" }, { status: 400 });
    }
    if (typeof body.reason !== "string") {
      return NextResponse.json({ error: "請填寫額外票說明（至少 2 個字）。" }, { status: 400 });
    }
    const participant = await adjustActivityTickets({
      participantId: body.participantId,
      delta: body.delta!,
      reason: body.reason,
      eventDate: body.eventDate,
      createdByMemberId: null,
    });
    return NextResponse.json({ ok: true, participant });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const staffToken = assertStaffTokenParam(token);
    await requireStaffFromRequest(staffToken);
    const url = new URL(request.url);
    const participantId = url.searchParams.get("participantId");
    if (!participantId) {
      return NextResponse.json({ error: "缺少 participantId" }, { status: 400 });
    }
    const detail = await getParticipantDetail(participantId);
    return NextResponse.json({ ok: true, events: detail.events, milestones: detail.milestones });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
