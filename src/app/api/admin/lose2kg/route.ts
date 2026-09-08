import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { listPeriods } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireLose2kgAdmin(request);
    const data = await listPeriods();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
