import {
  cleaningRosterErrorResponse,
  requireCleaningRosterAdmin,
} from "@/lib/cleaning-roster/api";
import { deleteMember, updateMember } from "@/lib/cleaning-roster/cleaning-roster-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireCleaningRosterAdmin(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const member = await updateMember(id, String(body.name ?? ""));
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireCleaningRosterAdmin(request);
    const { id } = await context.params;
    await deleteMember(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return cleaningRosterErrorResponse(error);
  }
}
