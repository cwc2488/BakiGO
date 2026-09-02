import { NextResponse } from "next/server";
import {
  RecruitmentError,
  submitRecruitmentLead,
} from "@/lib/recruitment/recruitment-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.partnerMemberId != null || body.partner_id != null || body.ownerMemberId != null) {
      return NextResponse.json(
        { error: "Invalid attribution payload.", code: "forged_partner_id" },
        { status: 400 },
      );
    }
    const lead = await submitRecruitmentLead({
      shareCode: String(body.shareCode ?? ""),
      name: String(body.name ?? ""),
      ageRange: String(body.ageRange ?? ""),
      city: String(body.city ?? ""),
      district: String(body.district ?? ""),
      workStatus: String(body.workStatus ?? ""),
      motivations: Array.isArray(body.motivations) ? body.motivations.map((item) => String(item)) : [],
      weeklyAvailability: String(body.weeklyAvailability ?? ""),
      instagram: body.instagram == null ? null : String(body.instagram),
      lineId: body.lineId == null ? null : String(body.lineId),
      phone: body.phone == null ? null : String(body.phone),
      consentAccepted: body.consentAccepted === true,
      utm: {
        utmSource: body.utmSource == null ? null : String(body.utmSource),
        utmMedium: body.utmMedium == null ? null : String(body.utmMedium),
        utmCampaign: body.utmCampaign == null ? null : String(body.utmCampaign),
        utmContent: body.utmContent == null ? null : String(body.utmContent),
        utmTerm: body.utmTerm == null ? null : String(body.utmTerm),
      },
      landingPath: body.landingPath == null ? null : String(body.landingPath),
      referrer: body.referrer == null ? null : String(body.referrer),
    });
    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      duplicateOfExisting: lead.duplicateOfExisting,
    });
  } catch (error) {
    if (error instanceof RecruitmentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit." },
      { status: 500 },
    );
  }
}
