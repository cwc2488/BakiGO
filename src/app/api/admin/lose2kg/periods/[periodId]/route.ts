import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { getPeriodBootstrap, updatePeriod } from "@/lib/lose2kg/service";
import type { Lose2kgPeriodStatus } from "@/types/lose2kg";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const data = await getPeriodBootstrap(periodId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      status?: Lose2kgPeriodStatus;
      measurementDates?: [string, string, string, string];
      publicEnabled?: boolean;
    };
    const period = await updatePeriod(periodId, body);
    return NextResponse.json({ ok: true, period });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
