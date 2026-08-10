import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createShareLinkForMember,
  getQuizResultById,
  listQuizResultsForMember,
  listShareLinksForMember,
  serializePartnerResult,
} from "@/lib/quiz/quiz-service";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  try {
    const results = await listQuizResultsForMember(memberId);
    return NextResponse.json({
      ok: true,
      leads: results.map((record) => ({
        resultId: record.resultId,
        respondentName: record.respondentName,
        completedAt: record.completedAt,
        primaryType: record.result.primaryType,
        interactionPriority: record.result.interactionPriority,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load leads." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Quiz service unavailable." }, { status: 503 });
  }

  try {
    const link = await createShareLinkForMember({ memberId });
    return NextResponse.json({ ok: true, ...link });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create share link." },
      { status: 400 },
    );
  }
}
