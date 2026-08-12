import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import {
  createCoachingCoachAction,
  listCoachingCoachActionsForEnrollment,
} from "@/lib/coaching/coach-actions/coaching-coach-action-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  isCoachingCoachActionStatus,
  isCoachingCoachActionType,
  type CoachingCoachActionStatus,
  type CoachingCoachActionType,
} from "@/types/coaching-coach-actions";
import type { CoachingEvidenceRef } from "@/types/coaching-timeline";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const actions = await listCoachingCoachActionsForEnrollment({
      enrollmentId,
      ownerMemberId: memberId,
    });
    return NextResponse.json({ ok: true, actions });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to list coach actions.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Coaching service unavailable." }, { status: 503 });
  }

  try {
    const { enrollmentId } = await context.params;
    const body = (await request.json()) as {
      actionType?: string;
      note?: string | null;
      relatedReasonCodes?: string[];
      evidenceRefs?: CoachingEvidenceRef[];
      relatedLogDate?: string | null;
      relatedMeasurementId?: string | null;
      status?: string;
      resolve?: boolean;
    };

    const actionTypeRaw = body.actionType ?? "note";
    if (!isCoachingCoachActionType(actionTypeRaw)) {
      return NextResponse.json({ error: "Invalid actionType" }, { status: 400 });
    }
    const actionType = actionTypeRaw as CoachingCoachActionType;

    let status: CoachingCoachActionStatus | undefined;
    if (body.status != null) {
      if (!isCoachingCoachActionStatus(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      status = body.status;
    }

    const action = await createCoachingCoachAction({
      enrollmentId,
      ownerMemberId: memberId,
      actionType,
      note: body.note,
      relatedReasonCodes: body.relatedReasonCodes,
      evidenceRefs: body.evidenceRefs,
      relatedLogDate: body.relatedLogDate,
      relatedMeasurementId: body.relatedMeasurementId,
      status,
      resolve: body.resolve === true,
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to create coach action.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
