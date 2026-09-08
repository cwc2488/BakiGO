import {
  cleaningRosterErrorResponse,
  requireCleaningRosterAdmin,
} from "@/lib/cleaning-roster/api";
import { createMember } from "@/lib/cleaning-roster/cleaning-roster-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireCleaningRosterAdmin(request);
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const member = await createMember(String(body.name ?? ""));
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}
