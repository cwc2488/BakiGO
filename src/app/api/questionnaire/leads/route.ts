import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  QuestionnaireError,
  listQuestionnaireLeads,
} from "@/lib/questionnaire/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const url = new URL(request.url);
    const result = await listQuestionnaireLeads({
      ownerMemberId: memberId,
      status: url.searchParams.get("status"),
      search: url.searchParams.get("search"),
      page: Number(url.searchParams.get("page") ?? "1") || 1,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list leads." },
      { status: 500 },
    );
  }
}
