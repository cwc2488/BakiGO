import { NextResponse } from "next/server";
import {
  TransformationError,
  submitTransformationLead,
} from "@/lib/transformation/transformation-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (
      body.partnerMemberId != null ||
      body.partner_id != null ||
      body.ownerMemberId != null ||
      body.ownerPartnerId != null
    ) {
      return NextResponse.json(
        { error: "Invalid attribution payload.", code: "forged_partner_id" },
        { status: 400 },
      );
    }
    const lead = await submitTransformationLead({
      shareCode: String(body.shareCode ?? ""),
      name: String(body.name ?? ""),
      phone: String(body.phone ?? ""),
      socialContact: body.socialContact == null ? null : String(body.socialContact),
      goal: String(body.goal ?? ""),
      targetAreaOrProblem: String(body.targetAreaOrProblem ?? ""),
      painPoint: String(body.painPoint ?? ""),
      consentAccepted: body.consentAccepted === true,
      source: body.source == null ? null : String(body.source),
      landingPath: body.landingPath == null ? null : String(body.landingPath),
      referrer: body.referrer == null ? null : String(body.referrer),
      landingPageVersion: body.landingPageVersion == null ? null : String(body.landingPageVersion),
      attribution: {
        utmSource: body.utmSource == null ? null : String(body.utmSource),
        utmMedium: body.utmMedium == null ? null : String(body.utmMedium),
        utmCampaign: body.utmCampaign == null ? null : String(body.utmCampaign),
        utmContent: body.utmContent == null ? null : String(body.utmContent),
        utmTerm: body.utmTerm == null ? null : String(body.utmTerm),
        fbclid: body.fbclid == null ? null : String(body.fbclid),
        campaignId: body.campaignId == null ? null : String(body.campaignId),
        adsetId: body.adsetId == null ? null : String(body.adsetId),
        adId: body.adId == null ? null : String(body.adId),
        placement: body.placement == null ? null : String(body.placement),
      },
    });
    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      duplicateOfExisting: lead.duplicateOfExisting,
    });
  } catch (error) {
    if (error instanceof TransformationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit." },
      { status: 500 },
    );
  }
}
