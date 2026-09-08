import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { upsertMeasurement } from "@/lib/lose2kg/service";
import type { Lose2kgMeasurementSlot } from "@/types/lose2kg";
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
      slot?: number;
      weightKg?: number | null;
      reason?: string;
    };
    const slot = Number(body.slot) as Lose2kgMeasurementSlot;
    if (![1, 2, 3, 4].includes(slot)) {
      return NextResponse.json({ error: "量測次數無效。" }, { status: 400 });
    }
    const result = await upsertMeasurement({
      participantId,
      slot,
      weightKg: body.weightKg ?? null,
      reason: body.reason,
      editedByMemberId: memberId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
