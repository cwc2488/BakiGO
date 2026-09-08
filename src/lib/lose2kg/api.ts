import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { NextResponse } from "next/server";

export class Lose2kgError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "lose2kg_error",
  ) {
    super(message);
    this.name = "Lose2kgError";
  }
}

export async function requireLose2kgAdmin(request: Request): Promise<string> {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    throw new Lose2kgError("Unauthorized.", 401, "unauthorized");
  }
  await assertSuperAdmin(memberId);
  return memberId;
}

export function lose2kgErrorResponse(error: unknown): NextResponse {
  if (error instanceof SuperAdminAccessError) {
    return NextResponse.json(
      { error: error.message, code: "forbidden" },
      { status: error.status },
    );
  }
  if (error instanceof Lose2kgError) {
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
