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
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > QUESTIONNAIRE_LIMITS.payloadMaxBytes) {
      return NextResponse.json({ error: "Payload too large.", code: "payload_too_large" }, { status: 413 });
    }

    const { code } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

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

    // Public response: no lead id / owner id / 5＋5 stats
    return NextResponse.json({
      ok: true,
      isNewLead: result.isNewLead,
    });
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit." },
      { status: 500 },
    );
  }
}
