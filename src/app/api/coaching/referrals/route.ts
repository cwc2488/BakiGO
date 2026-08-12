import { NextResponse } from "next/server";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { loadReferralCenterBundle } from "@/lib/coaching/referral-share/referral-center-service";
import {
  coachStartGrowthShare,
  coachStartManualGrowthShare,
  markAttributionHandled,
  pauseGrowthShare,
  revokeGrowthShare,
} from "@/lib/coaching/referral-share/share-service";
import { customerActivateGrowthShare } from "@/lib/coaching/referral-share/portal-share-service";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { isGrowthShareType } from "@/types/coaching-referral-share";

export const runtime = "nodejs";

function shareTypeLabel(shareType: string): string {
  if (shareType === "outcome_share") return "成果分享";
  if (shareType === "coach_referral") return "推薦給朋友";
  if (shareType === "friend_benefit") return "朋友專屬體驗";
  return "分享";
}

function attributionStatusLabel(status: string): string {
  if (status === "visited") return "已開啟連結";
  if (status === "interested") return "有興趣";
  if (status === "submitted") return "已留下資料";
  if (status === "customer_created") return "已成為顧客";
  if (status === "declined") return "已婉拒";
  return "更新中";
}

function shareStatusLabel(status: string): string {
  if (status === "pending_consent") return "等待顧客確認";
  if (status === "active") return "分享中";
  if (status === "paused") return "已暫停";
  if (status === "revoked") return "已撤銷";
  if (status === "expired") return "已過期";
  if (status === "declined") return "顧客婉拒";
  return "更新中";
}

export async function GET(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const ownerMemberId = await getMemberIdFromRequest(request);
    if (!ownerMemberId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const bundle = await loadReferralCenterBundle({ ownerMemberId });
    return NextResponse.json({
      ok: true,
      metrics: {
        suitableNowCount: bundle.metrics.suitableNowCount,
        sharingNowCount: bundle.metrics.sharingNowCount,
        newFriendsNeedingCoach: bundle.metrics.newFriendsNeedingCoach,
        activeShareCustomerCount: bundle.metrics.activeShareCustomerCount,
        sharesCreatedThisMonth: bundle.metrics.sharesCreatedThisMonth,
        interestedFriendsThisMonth: bundle.metrics.interestedFriendsThisMonth,
        newCustomersThisMonth: bundle.metrics.newCustomersThisMonth,
      },
      candidates: bundle.candidates.map((item) => ({
        customerId: item.customerId,
        customerName: item.customerName,
        enrollmentId: item.enrollmentId,
        state: item.state,
        stateLabel: item.stateLabel,
        reason: item.reason,
        nextActionLabel: item.nextActionLabel,
        canManualStart: item.canManualStart,
        startWarning: item.startWarning,
        opportunityId: item.opportunityId,
        pendingShareId: item.pendingShareId,
        suggestedShareTypes: item.suggestedShareTypes,
        primaryCta: item.primaryCta,
      })),
      shares: bundle.shares.map((share) => ({
        id: share.id,
        customerId: share.introducerCustomerId,
        customerName: bundle.customerNames[share.introducerCustomerId] ?? "顧客",
        shareTypeLabel: shareTypeLabel(share.shareType),
        statusLabel: shareStatusLabel(share.status),
        status: share.status,
        createdAt: share.createdAt,
      })),
      attributions: bundle.attributions.map((row) => ({
        id: row.id,
        introducerName: bundle.customerNames[row.introducerCustomerId] ?? "顧客",
        friendName: row.leadDisplayName ?? "朋友",
        introducedCustomerId: row.introducedCustomerId,
        statusLabel: attributionStatusLabel(row.status),
        linkedExistingCustomer: row.linkedExistingCustomer,
        submittedAt: row.submittedAt,
        coachHandledAt: row.coachHandledAt,
        goalText: row.leadGoalText,
      })),
      needsCoach: bundle.needsCoach.map((row) => ({
        id: row.id,
        introducerName: bundle.customerNames[row.introducerCustomerId] ?? "顧客",
        friendName: row.leadDisplayName ?? "朋友",
        introducedCustomerId: row.introducedCustomerId,
        statusLabel: attributionStatusLabel(row.status),
        linkedExistingCustomer: row.linkedExistingCustomer,
        submittedAt: row.submittedAt,
        goalText: row.leadGoalText,
      })),
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to load referral center.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const ownerMemberId = await getMemberIdFromRequest(request);
    if (!ownerMemberId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json()) as {
      action?: string;
      opportunityId?: string;
      customerId?: string;
      shareType?: string;
      shareId?: string;
      attributionId?: string;
      showIntroducerName?: boolean;
      showDayCount?: boolean;
      showMeasurementDelta?: boolean;
      shareText?: string | null;
    };

    if (body.action === "activate_consent") {
      if (!body.shareId || !body.customerId) {
        return NextResponse.json({ error: "缺少分享或顧客" }, { status: 400 });
      }
      const supabase = createSupabaseServiceClient();
      const { data: customer } = await supabase
        .from("customers")
        .select("display_name")
        .eq("id", body.customerId)
        .eq("owner_member_id", ownerMemberId)
        .maybeSingle();
      const result = await customerActivateGrowthShare({
        ownerMemberId,
        customerId: body.customerId,
        shareId: body.shareId,
        displayName: customer?.display_name ? String(customer.display_name) : null,
        dayCount: null,
        consent: {
          showIntroducerName: Boolean(body.showIntroducerName),
          showDayCount: body.showDayCount !== false,
          showMeasurementDelta: Boolean(body.showMeasurementDelta),
          shareText: body.shareText ?? null,
          measurementDeltaSummary: null,
        },
      });
      return NextResponse.json({
        ok: true,
        share: { id: result.share.id, status: result.share.status },
        publicPath: result.publicPath,
        message: "顧客已確認隱私。請複製連結給朋友。",
      });
    }

    if (body.action === "start") {
      const shareType =
        body.shareType && isGrowthShareType(body.shareType) ? body.shareType : null;

      // Prefer customer-based manual start (UX-1.2). Opportunity path kept for compatibility.
      if (body.customerId) {
        const result = await coachStartManualGrowthShare({
          ownerMemberId,
          customerId: body.customerId,
          shareType,
          opportunityId: body.opportunityId ?? null,
        });
        return NextResponse.json({
          ok: true,
          share: {
            id: result.share.id,
            shareType: result.share.shareType,
            status: result.share.status,
            shareTypeLabel: shareTypeLabel(result.share.shareType),
          },
          warning: result.warning,
          message: result.share.enrollmentId
            ? "已邀請顧客分享。請請顧客在陪跑頁確認隱私後取得連結。"
            : "已建立分享邀請。請提供顧客入口連結，或至顧客頁確認後分享。",
        });
      }

      if (!body.opportunityId) {
        return NextResponse.json({ error: "請選擇顧客" }, { status: 400 });
      }
      const result = await coachStartGrowthShare({
        ownerMemberId,
        opportunityId: body.opportunityId,
        shareType,
      });
      return NextResponse.json({
        ok: true,
        share: {
          id: result.share.id,
          shareType: result.share.shareType,
          status: result.share.status,
          shareTypeLabel: shareTypeLabel(result.share.shareType),
        },
        message: "已邀請顧客分享。請請顧客在陪跑頁確認隱私後取得連結。",
      });
    }

    if (body.action === "revoke" && body.shareId) {
      const share = await revokeGrowthShare({ ownerMemberId, shareId: body.shareId });
      return NextResponse.json({ ok: true, share: { id: share.id, status: share.status } });
    }

    if (body.action === "pause" && body.shareId) {
      const share = await pauseGrowthShare({ ownerMemberId, shareId: body.shareId });
      return NextResponse.json({ ok: true, share: { id: share.id, status: share.status } });
    }

    if (body.action === "mark_handled" && body.attributionId) {
      const attribution = await markAttributionHandled({
        ownerMemberId,
        attributionId: body.attributionId,
      });
      return NextResponse.json({
        ok: true,
        attribution: { id: attribution.id, coachHandledAt: attribution.coachHandledAt },
      });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "Failed to update referral center.");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
