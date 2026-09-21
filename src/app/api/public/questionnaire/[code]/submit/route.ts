import { NextResponse } from "next/server";
import { QUESTIONNAIRE_LIMITS } from "@/lib/questionnaire/contract";
import {
  QuestionnaireError,
  submitQuestionnaireResponse,
} from "@/lib/questionnaire/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Ctx) {
  try {
    const rawText = await request.text();
    const byteLength = new TextEncoder().encode(rawText).byteLength;
    if (byteLength > QUESTIONNAIRE_LIMITS.payloadMaxBytes) {
      return NextResponse.json(
        { error: "Payload too large.", code: "payload_too_large" },
        { status: 413 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON", code: "invalid_json" }, { status: 400 });
    }

    const { code } = await context.params;

    if (
      body.ownerMemberId != null ||
      body.owner_member_id != null ||
      body.partnerMemberId != null ||
      body.memberId != null
    ) {
      return NextResponse.json(
        { error: "Invalid attribution payload.", code: "forged_owner_id" },
        { status: 400 },
      );
    }

    const result = await submitQuestionnaireResponse({
      shareCode: code,
      source: body.source == null ? null : String(body.source),
      improvementAreas: Array.isArray(body.improvementAreas)
        ? body.improvementAreas.map((item) => String(item))
        : [],
      improvementOther: body.improvementOther == null ? null : String(body.improvementOther),
      bodySatisfactionScore: Number(body.bodySatisfactionScore),
      weeklyExerciseFrequency: String(body.weeklyExerciseFrequency ?? ""),
      usesSupplements:
        body.usesSupplements === true
          ? true
          : body.usesSupplements === false
            ? false
            : (undefined as unknown as boolean),
      supplementDetails: body.supplementDetails == null ? null : String(body.supplementDetails),
      priorityImprovement: String(body.priorityImprovement ?? ""),
      furtherUnderstandingInterest: String(body.furtherUnderstandingInterest ?? ""),
      displayName: String(body.displayName ?? ""),
      contactType: String(body.contactType ?? ""),
      contactValue: String(body.contactValue ?? ""),
      consentAccepted: body.consentAccepted === true,
      companyWebsite: body.companyWebsite == null ? null : String(body.companyWebsite),
    });

    return NextResponse.json({
      ok: true,
      isNewLead: result.isNewLead,
    });
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      // Validation / expected client errors — keep friendly message
      if (error.status >= 400 && error.status < 500 && error.code !== "submit_failed") {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      }
      console.error(
        JSON.stringify({
          event: "questionnaire_public_submit_failed",
          code: error.code,
          error: error.message,
        }),
      );
      return NextResponse.json(
        { error: "送出失敗，請稍後再試。", code: "submit_failed" },
        { status: 500 },
      );
    }
    console.error(
      JSON.stringify({
        event: "questionnaire_public_submit_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return NextResponse.json(
      { error: "送出失敗，請稍後再試。", code: "submit_failed" },
      { status: 500 },
    );
  }
}
