import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import { listRecognitionCandidates } from "@/lib/recognition/recognition-candidate-service";
import type { RecognitionReviewStatus } from "@/types/recognition";

export const runtime = "nodejs";

const STATUS_FILTERS = new Set([
  "all",
  "pending",
  "approved",
  "needs_fix",
  "rejected",
  "photo-required",
  "warnings",
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
    const url = new URL(request.url);
    const statusValue = url.searchParams.get("status") ?? "all";
    if (!STATUS_FILTERS.has(statusValue)) {
      return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    }
    const candidates = await listRecognitionCandidates(eventId, {
      status: statusValue as RecognitionReviewStatus | "all" | "photo-required" | "warnings",
      eventAwardId: url.searchParams.get("awardId") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
    });
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load candidates.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
