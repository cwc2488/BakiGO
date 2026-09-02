import { NextResponse } from "next/server";
import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  TransformationError,
  getOrCreateTransformationShareLink,
} from "@/lib/transformation/transformation-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    const link = await getOrCreateTransformationShareLink(memberId);
    return NextResponse.json({ ok: true, link });
  } catch (error) {
    if (error instanceof TransformationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof SuperAdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get share link." },
      { status: 500 },
    );
  }
}
