import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  getRecognitionEvent,
  RecognitionServiceError,
  rotateRecognitionPublicToken,
} from "@/lib/recognition/recognition-service";
import { buildPublicShareUrl } from "@/lib/app/public-origin";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;
    const event = await getRecognitionEvent(eventId);
    if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

    const url = event.publicCollectionToken
      ? buildPublicShareUrl(`/recognition/p/${event.publicCollectionToken}`, new URL(request.url).origin)
      : null;

    return NextResponse.json({
      ok: true,
      token: event.publicCollectionToken,
      url,
      rotatedAt: event.publicCollectionTokenRotatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load public token.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;
    const event = await rotateRecognitionPublicToken(eventId);
    const url = event.publicCollectionToken
      ? buildPublicShareUrl(`/recognition/p/${event.publicCollectionToken}`, new URL(request.url).origin)
      : null;

    return NextResponse.json({
      ok: true,
      token: event.publicCollectionToken,
      url,
      rotatedAt: event.publicCollectionTokenRotatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rotate public token.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
