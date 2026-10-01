import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { searchPublicSurveyMembers } from "@/lib/lose2kg/questionnaire";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const members = await searchPublicSurveyMembers({ surveyToken: token, query: q });
    return NextResponse.json({ ok: true, members });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
