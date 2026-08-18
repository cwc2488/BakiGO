import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { resolveIsSuperAdmin } from "@/lib/auth/super-admin";
import { SuperAdminAccessError } from "@/lib/auth/assert-super-admin";

export const runtime = "nodejs";

/** Returns 200 if current user is Super Admin, 403 otherwise. */
export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Admin service unavailable." }, { status: 503 });
  }

  try {
    const admin = await resolveIsSuperAdmin(memberId);
    if (!admin) {
      return NextResponse.json({ error: "Not a Super Admin." }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to check Super Admin status.";
    const status = error instanceof SuperAdminAccessError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
