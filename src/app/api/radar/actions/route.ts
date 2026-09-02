import { NextResponse } from "next/server";
import {
  applyRadarPartnerAction,
  isRadarPartnerAction,
} from "@/lib/radar/partner/apply-radar-partner-action";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionBody = {
  candidate_id?: string;
  action?: string;
};

export async function POST(request: Request) {
  const member_id = await getMemberIdFromRequest(request);
  if (!member_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  }

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const candidate_id = body.candidate_id?.trim() ?? "";
  const action = body.action?.trim() ?? "";
  if (!candidate_id || !isRadarPartnerAction(action)) {
    return NextResponse.json({ ok: false, error: "candidate_id and action are required" }, { status: 400 });
  }

  try {
    const result = await applyRadarPartnerAction({
      repo: new SupabaseRadarRepository(createSupabaseServiceClient()),
      member_id,
      candidate_id,
      action,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: result.status },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update candidate" },
      { status: 500 },
    );
  }
}
