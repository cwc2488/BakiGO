import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  getRecognitionEvent,
  updateRecognitionEvent,
  deleteRecognitionEvent,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import type { RecognitionEventStatus } from "@/types/recognition";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;
    const event = await getRecognitionEvent(eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load event.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;

    const body = (await request.json()) as {
      name?: string;
      year?: number;
      month?: number;
      collectStartsAt?: string | null;
      collectEndsAt?: string | null;
      status?: string;
    };

    const validStatuses: RecognitionEventStatus[] = ["draft", "collecting", "closed", "archived"];
    if (body.status && !validStatuses.includes(body.status as RecognitionEventStatus)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }

    const event = await updateRecognitionEvent(eventId, {
      name: body.name,
      year: body.year,
      month: body.month,
      collectStartsAt: body.collectStartsAt,
      collectEndsAt: body.collectEndsAt,
      status: body.status as RecognitionEventStatus | undefined,
    });

    return NextResponse.json({ ok: true, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update event.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;
    const result = await deleteRecognitionEvent(eventId);
    return NextResponse.json({ ok: true, eventId: result.eventId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete event.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
