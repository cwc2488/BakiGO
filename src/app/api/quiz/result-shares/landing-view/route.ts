import { NextResponse } from "next/server";
import { recordResultShareLandingView } from "@/lib/quiz/viral/quiz-result-share-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: true, recorded: false });
  }
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  try {
    const recorded = await recordResultShareLandingView({
      code: String(body.code ?? ""),
      userAgent: request.headers.get("user-agent"),
      humanHeader: request.headers.get("x-baki-human"),
    });
    return NextResponse.json({ ok: true, recorded: recorded.recorded });
  } catch {
    return NextResponse.json({ ok: true, recorded: false });
  }
}
