import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  RecruitmentError,
  listRecruitmentLeadsForPartner,
} from "@/lib/recruitment/recruitment-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const leads = await listRecruitmentLeadsForPartner(memberId);
    return NextResponse.json({ ok: true, leads });
  } catch (error) {
    if (error instanceof RecruitmentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list leads." },
      { status: 500 },
    );
  }
}
