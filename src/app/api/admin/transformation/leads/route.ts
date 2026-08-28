import { NextResponse } from "next/server";
import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  TransformationError,
  listTransformationLeadsForAdmin,
} from "@/lib/transformation/transformation-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const leads = await listTransformationLeadsForAdmin({ status: status || null });
    return NextResponse.json({ ok: true, leads });
  } catch (error) {
    if (error instanceof TransformationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof SuperAdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list leads." },
      { status: 500 },
    );
  }
}
