import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import {
  CoachingServiceError,
  resolveActiveCoachingPortal,
} from "@/lib/coaching/coaching-service";
import {
  buildPortalShareCardView,
  customerActivateGrowthShare,
  customerDeclineGrowthShare,
} from "@/lib/coaching/referral-share/portal-share-service";
import { listPendingConsentSharesForCustomer } from "@/lib/coaching/referral-share/share-service";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

export const runtime = "nodejs";

/**
 * Customer portal share invites — never expose Growth Opportunity / Matrix / attribution internals.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    if (!portal) {
      return NextResponse.json({ error: "連結無效或已過期" }, { status: 404 });
    }

    const shares = await listPendingConsentSharesForCustomer({
      ownerMemberId: portal.ownerMemberId,
      customerId: portal.customerId,
    });

    // Hide paused (Rescue) and only show actionable invite cards
    const visible = shares.filter((share) => share.status === "pending_consent" || share.status === "active");

    return NextResponse.json({
      ok: true,
      invites: visible.map((share) => {
        const view = buildPortalShareCardView({ share });
        return {
          shareId: view.shareId,
          status: view.status,
          ctaTitle: view.ctaTitle,
          ctaBody: view.ctaBody,
          shareTypeLabel:
            share.shareType === "outcome_share"
              ? "成果分享"
              : share.shareType === "friend_benefit"
                ? "朋友專屬體驗"
                : "分享給朋友",
          preview: view.preview,
          canActivate: share.status === "pending_consent" || share.status === "active",
          canDecline: share.status === "pending_consent",
        };
      }),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load share invites.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    if (!portal) {
      return NextResponse.json({ error: "連結無效或已過期" }, { status: 404 });
    }

    const body = (await request.json()) as {
      action?: string;
      shareId?: string;
      showIntroducerName?: boolean;
      showDayCount?: boolean;
      showMeasurementDelta?: boolean;
      shareText?: string | null;
      measurementDeltaSummary?: string | null;
    };

    if (!body.shareId) {
      return NextResponse.json({ error: "缺少分享編號" }, { status: 400 });
    }

    if (body.action === "decline") {
      const share = await customerDeclineGrowthShare({
        ownerMemberId: portal.ownerMemberId,
        customerId: portal.customerId,
        shareId: body.shareId,
      });
      return NextResponse.json({ ok: true, status: share.status });
    }

    if (body.action !== "activate") {
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("display_name")
      .eq("id", portal.customerId)
      .eq("owner_member_id", portal.ownerMemberId)
      .maybeSingle();

    let dayCount: number | null = null;
    if (portal.enrollmentId) {
      const { data: enrollment } = await supabase
        .from("coaching_enrollments")
        .select("started_at")
        .eq("id", portal.enrollmentId)
        .maybeSingle();
      if (enrollment?.started_at) {
        const start = Date.parse(String(enrollment.started_at));
        if (!Number.isNaN(start)) {
          dayCount = Math.max(1, Math.round((Date.now() - start) / (1000 * 60 * 60 * 24)) + 1);
        }
      }
    }

    const result = await customerActivateGrowthShare({
      ownerMemberId: portal.ownerMemberId,
      customerId: portal.customerId,
      shareId: body.shareId,
      displayName: customer?.display_name != null ? String(customer.display_name) : null,
      dayCount,
      consent: {
        showIntroducerName: Boolean(body.showIntroducerName),
        showDayCount: body.showDayCount !== false,
        showMeasurementDelta: Boolean(body.showMeasurementDelta),
        shareText: body.shareText ?? null,
        measurementDeltaSummary: body.measurementDeltaSummary ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      status: result.share.status,
      publicPath: result.publicPath,
      shareUrl: result.publicPath,
      preview: buildPortalShareCardView({ share: result.share }).preview,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to update share invite.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
