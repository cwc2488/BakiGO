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

export async function POST(request: Request) {
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
    fishPoolCount?: number;
    invitationFiveStepsCount?: number;
  };

  const reportDate = payload.reportDate;
  if (!reportDate || typeof reportDate !== "string") {
    return NextResponse.json({ error: "reportDate required" }, { status: 400 });
  }
  if (reportDate >= fivePlusFiveToday()) {
    return NextResponse.json(
      { error: "Use today endpoint for current day; backfill is for past dates only" },
      { status: 400 },
    );
  }

  try {
    const report = await upsertMyReport({
      memberId,
      reportDate,
      fishPoolCount: Number(payload.fishPoolCount),
      invitationFiveStepsCount: Number(payload.invitationFiveStepsCount),
    });
    const { stats } = await getMyStats(memberId);
    return NextResponse.json({ report, stats });
  } catch (error) {
    if (error instanceof FivePlusFiveServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
