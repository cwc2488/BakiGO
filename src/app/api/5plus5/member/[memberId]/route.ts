import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  FivePlusFiveServiceError,
  getMemberDetail,
} from "@/lib/five-plus-five/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ memberId: string }> };

export async function GET(request: Request, context: Ctx) {
  const viewerId = await getMemberIdFromRequest(request);
  if (!viewerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId } = await context.params;
  if (!memberId) {
    return NextResponse.json({ error: "memberId required" }, { status: 400 });
  }

  try {
    const detail = await getMemberDetail(viewerId, memberId);
    return NextResponse.json({ detail });
  } catch (error) {
    if (error instanceof FivePlusFiveServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Upline must not mutate downline reports — reject all writes. */
export async function PUT() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
