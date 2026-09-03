import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  listTrainingOrganizationSummaries,
  TrainingServiceError,
} from "@/lib/training/training-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (!isSupabaseServiceConfigured()) {
      return NextResponse.json({ error: "Training service unavailable." }, { status: 503 });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? undefined;
    const list = await listTrainingOrganizationSummaries({
      viewerMemberId: memberId,
      query,
    });
    return NextResponse.json({ ok: true, ...list });
  } catch (error) {
    if (error instanceof TrainingServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load organization." },
      { status: 500 },
    );
  }
}
