import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  QuestionnaireError,
  getOrCreateQuestionnaireShareLink,
} from "@/lib/questionnaire/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const share = await getOrCreateQuestionnaireShareLink(memberId);
    return NextResponse.json({ ok: true, share });
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load share link." },
      { status: 500 },
    );
  }
}
