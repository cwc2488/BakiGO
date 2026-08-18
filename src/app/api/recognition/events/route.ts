import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  createRecognitionEvent,
  listRecognitionEventSummaries,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const url = new URL(request.url);
    const yearValue = url.searchParams.get("year");
    const monthValue = url.searchParams.get("month");
    const year = yearValue ? Number(yearValue) : undefined;
    const month = monthValue ? Number(monthValue) : undefined;
    if (yearValue && !Number.isInteger(year)) {
      return NextResponse.json({ error: "year must be an integer." }, { status: 400 });
    }
    if (monthValue && !Number.isInteger(month)) {
      return NextResponse.json({ error: "month must be an integer." }, { status: 400 });
    }
    const events = await listRecognitionEventSummaries({ year, month });
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load events.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);

    const body = (await request.json()) as {
      name?: string;
      year?: number;
      month?: number;
      collectStartsAt?: string | null;
      collectEndsAt?: string | null;
      copiedFromEventId?: string | null;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required." }, { status: 400 });
    }
    if (!body.year || !body.month) {
      return NextResponse.json({ error: "year and month are required." }, { status: 400 });
    }

    const event = await createRecognitionEvent({
      name: body.name,
      year: body.year,
      month: body.month,
      collectStartsAt: body.collectStartsAt ?? null,
      collectEndsAt: body.collectEndsAt ?? null,
      copiedFromEventId: body.copiedFromEventId ?? null,
      createdByMemberId: memberId,
    });

    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create event.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
