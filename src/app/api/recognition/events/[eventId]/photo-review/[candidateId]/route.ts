import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import {
  getRecognitionCandidatePhotoReview,
  updateRecognitionCandidatePhotoReview,
} from "@/lib/recognition/recognition-photo-review-service";
import { isRecognitionPhotoReviewFlag, parseRecognitionNormalizedCrop } from "@/lib/recognition/recognition-photo-review";
import type { RecognitionPhotoReviewFlag, RecognitionPhotoReviewUpdateInput } from "@/types/recognition";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string; candidateId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId, candidateId } = await context.params;
    const item = await getRecognitionCandidatePhotoReview(eventId, candidateId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load photo review.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string; candidateId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId, candidateId } = await context.params;
    const body = (await request.json()) as {
      sourceEntryId?: string;
      crop?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
      originalWidth?: number | null;
      originalHeight?: number | null;
      flags?: string[];
      isBlocked?: boolean;
      blockedReason?: string | null;
      finalize?: boolean;
    };
    if (!body.sourceEntryId) {
      return NextResponse.json({ error: "sourceEntryId is required." }, { status: 400 });
    }
    const input: RecognitionPhotoReviewUpdateInput = {
      sourceEntryId: body.sourceEntryId,
    };
    if (body.crop !== undefined) {
      input.crop = body.crop === null ? null : parseRecognitionNormalizedCrop(body.crop);
      if (body.crop !== null && !input.crop) {
        return NextResponse.json({ error: "crop coordinates are required." }, { status: 400 });
      }
    }
    if (body.originalWidth !== undefined) input.originalWidth = body.originalWidth;
    if (body.originalHeight !== undefined) input.originalHeight = body.originalHeight;
    if (body.flags !== undefined) {
      input.flags = body.flags.filter((flag): flag is RecognitionPhotoReviewFlag => (
        isRecognitionPhotoReviewFlag(flag)
      ));
      if (input.flags.length !== body.flags.length) {
        return NextResponse.json({ error: "unknown photo review flag" }, { status: 400 });
      }
    }
    if (body.isBlocked !== undefined) input.isBlocked = body.isBlocked;
    if (body.blockedReason !== undefined) input.blockedReason = body.blockedReason;
    if (body.finalize !== undefined) input.finalize = body.finalize;

    const item = await updateRecognitionCandidatePhotoReview(eventId, candidateId, input, memberId);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update photo review.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
