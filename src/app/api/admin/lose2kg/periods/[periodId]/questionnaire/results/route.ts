import { Lose2kgError, lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { getQuestionnaireAdminResults } from "@/lib/lose2kg/questionnaire";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const data = await getQuestionnaireAdminResults(periodId);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
