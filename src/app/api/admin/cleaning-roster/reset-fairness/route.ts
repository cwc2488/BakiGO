import {
  cleaningRosterErrorResponse,
  requireCleaningRosterAdmin,
} from "@/lib/cleaning-roster/api";
import { resetFairness } from "@/lib/cleaning-roster/cleaning-roster-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireCleaningRosterAdmin(request);
    const data = await resetFairness();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}
