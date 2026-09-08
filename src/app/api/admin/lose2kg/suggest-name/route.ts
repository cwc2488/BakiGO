import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { suggestNextPeriodName } from "@/lib/lose2kg/v2-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireLose2kgAdmin(request);
    const name = await suggestNextPeriodName();
    return NextResponse.json({ ok: true, name });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
