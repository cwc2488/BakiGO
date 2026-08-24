import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import { listRecognitionPhotoReviewQueue } from "@/lib/recognition/recognition-photo-review-service";
import type { RecognitionPhotoReviewQueueFilter } from "@/types/recognition";

export const runtime = "nodejs";

const FILTERS = new Set<RecognitionPhotoReviewQueueFilter>([
  "all-photo-required",
  "needs-review",
  "crop-ready",
  "blocked",
  "missing-photo",
  "no-preferred-photo",
]);

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
    const requested = new URL(request.url).searchParams.get("filter") ?? "all-photo-required";
    const filter = FILTERS.has(requested as RecognitionPhotoReviewQueueFilter)
      ? requested as RecognitionPhotoReviewQueueFilter
      : "all-photo-required";
    const result = await listRecognitionPhotoReviewQueue(eventId, filter);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load photo review queue.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
