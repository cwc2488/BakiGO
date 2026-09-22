import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  QuestionnaireError,
  deleteQuestionnaireLead,
  getQuestionnaireLeadDetail,
  updateQuestionnaireLeadStatus,
} from "@/lib/questionnaire/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await context.params;
    const lead = await getQuestionnaireLeadDetail({
      ownerMemberId: memberId,
      leadId: id,
    });
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load lead." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await context.params;
    const body = (await request.json()) as {
      status?: string;
      ownerMemberId?: unknown;
    };
    if (body.ownerMemberId != null) {
      return NextResponse.json(
        { error: "Invalid payload.", code: "forged_owner_id" },
        { status: 400 },
      );
    }
    const lead = await updateQuestionnaireLeadStatus({
      ownerMemberId: memberId,
      leadId: id,
      status: String(body.status ?? ""),
    });
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update lead." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await context.params;

    // Reject forged owner from body if present (DELETE may have no body)
    let body: { ownerMemberId?: unknown } = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as { ownerMemberId?: unknown };
      }
    } catch {
      body = {};
    }
    if (body.ownerMemberId != null) {
      return NextResponse.json(
        { error: "Invalid payload.", code: "forged_owner_id" },
        { status: 400 },
      );
    }

    const result = await deleteQuestionnaireLead({
      ownerMemberId: memberId,
      leadId: id,
    });
    return NextResponse.json({
      ok: true,
      fishReversed: result.fishReversed,
      invitationReversed: result.invitationReversed,
    });
  } catch (error) {
    if (error instanceof QuestionnaireError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete lead." },
      { status: 500 },
    );
  }
}
