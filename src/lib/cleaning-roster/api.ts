import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { CleaningRosterError } from "@/lib/cleaning-roster/cleaning-roster-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { NextResponse } from "next/server";

export async function requireCleaningRosterAdmin(request: Request): Promise<string> {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    throw new CleaningRosterError("Unauthorized.", 401, "unauthorized");
  }
  await assertSuperAdmin(memberId);
  return memberId;
}

export function cleaningRosterErrorResponse(error: unknown): NextResponse {
  if (error instanceof SuperAdminAccessError) {
    return NextResponse.json(
      { error: error.message, code: "forbidden" },
      { status: error.status },
    );
  }
  if (error instanceof CleaningRosterError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof Error && error.message) {
    return NextResponse.json({ error: error.message, code: "bad_request" }, { status: 400 });
  }
  return NextResponse.json({ error: "Internal error.", code: "internal" }, { status: 500 });
}
