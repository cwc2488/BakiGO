import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { getPublicSurveyBootstrap } from "@/lib/lose2kg/questionnaire";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const data = await getPublicSurveyBootstrap(token);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
