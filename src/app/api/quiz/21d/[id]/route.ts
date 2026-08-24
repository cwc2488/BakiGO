import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  archivePartner21dInterest,
  getPartner21dInterest,
  markPartner21dStatus,
} from "@/lib/analysis/handoff/experience-21d-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  const { id } = await context.params;
  const detail = await getPartner21dInterest(memberId, id);
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...detail });
}

export async function POST(request: Request, context: Ctx) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as { action?: string };
  const action = body.action;
  if (action === "archive") {
    const card = await archivePartner21dInterest(memberId, id);
    if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, archived: true, card });
  }
  const next =
    action === "mark_contacted"
      ? "contacted"
      : action === "mark_joined"
        ? "joined"
        : action === "mark_declined"
          ? "declined"
          : null;
  if (!next) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  const card = await markPartner21dStatus(memberId, id, next);
  if (!card) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, card });
}
