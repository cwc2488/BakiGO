import { NextResponse } from "next/server";
import {
  RecruitmentError,
  resolveActiveRecruitmentPartnerByCode,
} from "@/lib/recruitment/recruitment-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

/** Public resolve — returns display-safe partner label only, never UUID. */
export async function GET(_request: Request, context: Ctx) {
  try {
    const { code } = await context.params;
    const partner = await resolveActiveRecruitmentPartnerByCode(code);
    return NextResponse.json({
      ok: true,
      shareCode: partner.shareCode,
      partnerLabel: partner.partnerDisplayName,
    });
  } catch (error) {
    if (error instanceof RecruitmentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve." },
      { status: 500 },
    );
  }
}
