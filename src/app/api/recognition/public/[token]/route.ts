import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { resolveRecognitionPublicEventByToken, RecognitionServiceError } from "@/lib/recognition/recognition-service";
import { allowRecognitionPublicLookup, getRecognitionClientIp } from "@/lib/recognition/recognition-public-rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  const ip = getRecognitionClientIp(request);
  if (!allowRecognitionPublicLookup(`lookup:${ip}`)) {
    return NextResponse.json({ error: "請稍後再試。", code: "rate_limited" }, { status: 429 });
  }

  try {
    const { token } = await context.params;
    const resolved = await resolveRecognitionPublicEventByToken(token);

    if (!resolved.event) {
      return NextResponse.json({ error: "連結無效或已失效。", code: "invalid_link" }, { status: 404 });
    }

    if (resolved.state !== "open") {
      const stateErrors: Record<"invalid" | "not_started" | "closed" | "expired", { error: string; code: string; status: number }> = {
        invalid: { error: "連結無效或已失效。", code: "invalid_link", status: 404 },
        not_started: { error: "收件尚未開始。", code: "not_started", status: 403 },
        closed: { error: "收件已關閉。", code: "closed", status: 403 },
        expired: { error: "收件已過期。", code: "expired", status: 403 },
      };
      const state = stateErrors[resolved.state];
      return NextResponse.json({ error: state.error, code: state.code }, { status: state.status });
    }

    return NextResponse.json({ ok: true, event: resolved.event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load event.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
