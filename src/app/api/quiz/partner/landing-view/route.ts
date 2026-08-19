import { NextResponse } from "next/server";
import { recordPartnerLandingView } from "@/lib/quiz/partner/quiz-partner-funnel";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: true, recorded: false });
  }
  const body = (await request.json().catch(() => ({}))) as { shareCode?: string };
  try {
    const recorded = await recordPartnerLandingView({
      shareCode: String(body.shareCode ?? ""),
      userAgent: request.headers.get("user-agent"),
      humanHeader: request.headers.get("x-baki-human"),
    });
    return NextResponse.json({ ok: true, recorded: recorded.recorded });
  } catch {
    return NextResponse.json({ ok: true, recorded: false });
  }
}
