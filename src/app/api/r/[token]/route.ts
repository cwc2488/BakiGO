import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import {
  resolvePublicShareByToken,
  submitFriendInterestByToken,
} from "@/lib/coaching/referral-share/public-share-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const resolved = await resolvePublicShareByToken({ token });
    if (!resolved) {
      return NextResponse.json({ error: "找不到此分享頁" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, share: resolved.payload });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load share page.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const body = (await request.json()) as {
      displayName?: string;
      phone?: string;
      lineId?: string;
      goalText?: string;
    };
    const result = await submitFriendInterestByToken({
      token,
      displayName: body.displayName ?? "",
      phone: body.phone ?? null,
      lineId: body.lineId ?? null,
      goalText: body.goalText ?? null,
    });
    return NextResponse.json({
      ok: true,
      message: result.linkedExisting
        ? "已收到你的資料。教練會再與你連絡。"
        : "已收到你的資料。教練會再與你連絡。",
      // Never return introducer private data / owner ids / attribution internals
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to submit interest.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
