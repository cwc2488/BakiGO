import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { assertStaffTokenParam, requireStaffFromRequest } from "@/lib/lose2kg/staff-api";
import { staffQuickMeasure } from "@/lib/lose2kg/v2-service";
import type { Lose2kgMeasurementSlot } from "@/types/lose2kg";
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
      slot?: number;
      weightKg?: number;
    };
    const slot = Number(body.slot) as Lose2kgMeasurementSlot;
    if (!body.participantId || ![1, 2, 3, 4].includes(slot)) {
      return NextResponse.json({ error: "參數無效。" }, { status: 400 });
    }
    if (!(typeof body.weightKg === "number") || !(body.weightKg > 0)) {
      return NextResponse.json({ error: "體重無效。" }, { status: 400 });
    }
    const result = await staffQuickMeasure({
      participantId: body.participantId,
      slot,
      weightKg: body.weightKg,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
