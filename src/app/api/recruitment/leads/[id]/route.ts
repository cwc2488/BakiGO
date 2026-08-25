import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  RecruitmentError,
  updateRecruitmentLeadStatusForPartner,
} from "@/lib/recruitment/recruitment-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await context.params;
    const body = (await request.json()) as { status?: string; partnerMemberId?: unknown };
    if (body.partnerMemberId != null) {
      return NextResponse.json(
        { error: "Invalid payload.", code: "forged_partner_id" },
        { status: 400 },
      );
    }
    const lead = await updateRecruitmentLeadStatusForPartner({
      partnerMemberId: memberId,
      leadId: id,
      status: String(body.status ?? ""),
    });
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    if (error instanceof RecruitmentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update lead." },
      { status: 500 },
    );
  }
}
