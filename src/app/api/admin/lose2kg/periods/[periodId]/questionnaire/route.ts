import { Lose2kgError, lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import {
  getOrCreateQuestionnaireSettings,
  regenerateQuestionnaireToken,
  setQuestionnaireOpen,
} from "@/lib/lose2kg/questionnaire";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const settings = await getOrCreateQuestionnaireSettings(periodId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      isOpen?: boolean;
      regenerateToken?: boolean;
    };

    if (body.regenerateToken) {
      const settings = await regenerateQuestionnaireToken(periodId);
      return NextResponse.json({ ok: true, settings });
    }
    if (typeof body.isOpen === "boolean") {
      const settings = await setQuestionnaireOpen(periodId, body.isOpen);
      return NextResponse.json({ ok: true, settings });
    }
    throw new Lose2kgError("缺少有效操作。", 400, "invalid_request");
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
