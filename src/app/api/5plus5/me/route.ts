import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  FivePlusFiveServiceError,
  getMyStats,
  upsertMyReport,
} from "@/lib/five-plus-five/service";
import { fivePlusFiveToday } from "@/lib/five-plus-five/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof FivePlusFiveServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(
    JSON.stringify({
      event: "five_plus_five_me_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

function resolveManualCounts(payload: {
  manualFishPoolCount?: number;
  manualInvitationFiveStepsCount?: number;
  fishPoolCount?: number;
  invitationFiveStepsCount?: number;
}): { manualFishPoolCount: number; manualInvitationFiveStepsCount: number } {
  const manualFish =
    payload.manualFishPoolCount !== undefined
      ? Number(payload.manualFishPoolCount)
      : Number(payload.fishPoolCount);
  const manualInvite =
    payload.manualInvitationFiveStepsCount !== undefined
      ? Number(payload.manualInvitationFiveStepsCount)
      : Number(payload.invitationFiveStepsCount);
  return {
    manualFishPoolCount: manualFish,
    manualInvitationFiveStepsCount: manualInvite,
  };
}

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await getMyStats(memberId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as {
    reportDate?: string;
    manualFishPoolCount?: number;
    manualInvitationFiveStepsCount?: number;
    fishPoolCount?: number;
    invitationFiveStepsCount?: number;
  };

  try {
    const counts = resolveManualCounts(payload);
    const report = await upsertMyReport({
      memberId,
      reportDate: payload.reportDate ?? fivePlusFiveToday(),
      manualFishPoolCount: counts.manualFishPoolCount,
      manualInvitationFiveStepsCount: counts.manualInvitationFiveStepsCount,
    });
    const { stats } = await getMyStats(memberId);
    return NextResponse.json({ report, stats });
  } catch (error) {
    return errorResponse(error);
  }
}
