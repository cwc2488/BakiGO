import {
  cleaningRosterErrorResponse,
  requireCleaningRosterAdmin,
} from "@/lib/cleaning-roster/api";
import { createArea } from "@/lib/cleaning-roster/cleaning-roster-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireCleaningRosterAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const area = await createArea(String(body.name ?? ""));
    return NextResponse.json({ ok: true, area });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}
