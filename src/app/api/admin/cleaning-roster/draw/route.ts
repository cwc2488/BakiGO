import {
  cleaningRosterErrorResponse,
  requireCleaningRosterAdmin,
} from "@/lib/cleaning-roster/api";
import { previewDraw } from "@/lib/cleaning-roster/cleaning-roster-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireCleaningRosterAdmin(request);
    const preview = await previewDraw();
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}
