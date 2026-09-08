import {
  cleaningRosterErrorResponse,
  requireCleaningRosterAdmin,
} from "@/lib/cleaning-roster/api";
import { bootstrapCleaningRoster } from "@/lib/cleaning-roster/cleaning-roster-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireCleaningRosterAdmin(request);
    const data = await bootstrapCleaningRoster();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}
