import { NextResponse } from "next/server";
import { upsertRadarFeedback } from "@/lib/radar/feedback/upsert-radar-feedback";
import { SupabaseRadarRepository } from "@/lib/radar/repository/supabase-repository";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeedbackBody = {
  candidate_id?: unknown;
  feedback?: unknown;
  rejection_reason?: unknown;
  optional_note?: unknown;
};

export async function POST(request: Request) {
  const member_id = await getMemberIdFromRequest(request);
  if (!member_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  }

  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const candidate_id = typeof body.candidate_id === "string" ? body.candidate_id.trim() : "";
  const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
  if (!candidate_id || !feedback) {
    return NextResponse.json(
      { ok: false, error: "candidate_id and feedback are required" },
      { status: 400 },
    );
  }

  try {
    const result = await upsertRadarFeedback({
      repo: new SupabaseRadarRepository(createSupabaseServiceClient()),
      member_id,
      candidate_id,
      feedback,
      rejection_reason: typeof body.rejection_reason === "string" ? body.rejection_reason : null,
      optional_note: typeof body.optional_note === "string" ? body.optional_note : null,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      ok: true,
      feedback: result.feedback,
      today_snapshot_unchanged: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save feedback",
      },
      { status: 500 },
    );
  }
}
