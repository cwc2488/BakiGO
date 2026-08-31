import { NextResponse } from "next/server";
import { canViewMember } from "@/lib/auth/organization-access";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { Member } from "@/types/member";

export const runtime = "nodejs";

function buildMembersForAuth(
  rows: Array<{ id: string; member_number: string; sponsor_member_number: string | null }>,
): Member[] {
  const idByNumber = new Map(rows.map((row) => [row.member_number, row.id]));

  return rows.map((row) => ({
    id: row.id,
    sponsorMemberId: row.sponsor_member_number
      ? idByNumber.get(row.sponsor_member_number)
      : undefined,
    rankKey: "new_member",
    status: "active",
  })) as Member[];
}

/** Server-side downline authorization — prevents IDOR for partner V2 views. */
export async function GET(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  const viewerId = await getMemberIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ authorized: false, reason: "unauthenticated" }, { status: 401 });
  }

  const { memberId: targetMemberId } = await context.params;

  if (viewerId === targetMemberId) {
    return NextResponse.json({ authorized: true, mode: "self" });
  }

  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { authorized: false, reason: "service_unavailable" },
      { status: 503 },
    );
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("members")
      .select("id, member_number, sponsor_member_number");

    if (error) {
      throw new Error(error.message);
    }

    const members = buildMembersForAuth(data ?? []);
    const viewer = members.find((member) => member.id === viewerId);
    if (!viewer) {
      return NextResponse.json({ authorized: false, reason: "viewer_not_found" }, { status: 403 });
    }

    const authorized = canViewMember(viewer, targetMemberId, members);
    if (!authorized) {
      return NextResponse.json({ authorized: false, reason: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({ authorized: true, mode: "downline" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authorization check failed.";
    return NextResponse.json({ authorized: false, reason: message }, { status: 500 });
  }
}
