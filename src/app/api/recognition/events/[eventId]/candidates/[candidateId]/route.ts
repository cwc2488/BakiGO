import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import {
  getRecognitionCandidate,
  updateRecognitionCandidate,
} from "@/lib/recognition/recognition-candidate-service";
import type { RecognitionCandidateUpdateInput, RecognitionReviewStatus } from "@/types/recognition";

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
    const candidate = await getRecognitionCandidate(eventId, candidateId);
    return NextResponse.json({ ok: true, candidate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load candidate.";
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
    const body = (await request.json()) as RecognitionCandidateUpdateInput;
    const input: RecognitionCandidateUpdateInput = {};
    if (body.reviewStatus !== undefined) {
      input.reviewStatus = body.reviewStatus as RecognitionReviewStatus;
    }
    if (body.displayName !== undefined) input.displayName = body.displayName;
    if (body.preferredSourceEntryId !== undefined) {
      input.preferredSourceEntryId = body.preferredSourceEntryId;
    }
    if (
      input.reviewStatus === undefined
      && input.displayName === undefined
      && input.preferredSourceEntryId === undefined
    ) {
      return NextResponse.json({ error: "No candidate fields to update." }, { status: 400 });
    }
    const candidate = await updateRecognitionCandidate(eventId, candidateId, input, memberId);
    return NextResponse.json({ ok: true, candidate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update candidate.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
