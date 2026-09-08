import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import {
  getParticipantDetail,
  removeParticipant,
  updateParticipant,
} from "@/lib/lose2kg/service";
import type { Lose2kgParticipant } from "@/types/lose2kg";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ participantId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { participantId } = await context.params;
    const data = await getParticipantDetail(participantId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ participantId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { participantId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      publicDisplayName?: string;
      note?: string | null;
      status?: Lose2kgParticipant["status"];
    };
    const participant = await updateParticipant(participantId, body);
    return NextResponse.json({ ok: true, participant });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ participantId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { participantId } = await context.params;
    await removeParticipant(participantId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
