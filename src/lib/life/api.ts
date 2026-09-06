import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { LifeError } from "@/lib/life/life-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { NextResponse } from "next/server";

export async function requireLifeOwner(request: Request): Promise<string> {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    throw new LifeError("Unauthorized.", 401, "unauthorized");
  }
  await assertSuperAdmin(memberId);
  return memberId;
}

export function lifeErrorResponse(error: unknown): NextResponse {
  if (error instanceof SuperAdminAccessError) {
    return NextResponse.json(
      { error: error.message, code: "forbidden" },
      { status: error.status },
    );
  }
  if (error instanceof LifeError) {
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
