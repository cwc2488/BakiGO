import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  buildPublicDisplayFromConsent,
  toPublicSharePayload,
} from "@/lib/coaching/referral-share/public-payload";
import { isShareAcceptingReferrals } from "@/lib/coaching/referral-share/share-eligibility";
import {
  generateGrowthShareToken,
  hashGrowthShareToken,
} from "@/lib/coaching/referral-share/share-token";
import { mapGrowthShareRow } from "@/lib/coaching/referral-share/mappers";
import type {
  GrowthShareConsentSnapshot,
  GrowthShareRecord,
  PublicSharePayload,
} from "@/types/coaching-referral-share";

async function loadShareForCustomer(input: {
  shareId: string;
  ownerMemberId: string;
  customerId: string;
}): Promise<GrowthShareRecord> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_shares")
    .select("*")
    .eq("id", input.shareId)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("introducer_customer_id", input.customerId)
    .maybeSingle();
  if (error || !data) {
    throw new CoachingServiceError(error?.message || "找不到分享邀請。", error ? 500 : 404);
  }
  return mapGrowthShareRow(data as Record<string, unknown>);
}

export async function customerActivateGrowthShare(input: {
  ownerMemberId: string;
  customerId: string;
  shareId: string;
  displayName: string | null;
  dayCount: number | null;
  consent: {
    showIntroducerName: boolean;
    showDayCount: boolean;
    showMeasurementDelta: boolean;
    shareText: string | null;
    measurementDeltaSummary: string | null;
  };
}): Promise<{ share: GrowthShareRecord; plaintextToken: string; publicPath: string }> {
  const existing = await loadShareForCustomer({
    shareId: input.shareId,
    ownerMemberId: input.ownerMemberId,
    customerId: input.customerId,
  });
  if (existing.status === "revoked" || existing.status === "expired" || existing.status === "declined") {
    throw new CoachingServiceError("此分享邀請已無法啟用。", 400);
  }
  if (existing.status === "paused") {
    throw new CoachingServiceError("目前暫不適合分享，請先與教練聊聊。", 400);
  }

  const nowIso = new Date().toISOString();
  const consent: GrowthShareConsentSnapshot = {
    consentedAt: nowIso,
    consentedBy: "customer",
    showIntroducerName: input.consent.showIntroducerName,
    showDayCount: input.consent.showDayCount,
    showMeasurementDelta: input.consent.showMeasurementDelta,
    shareText: input.consent.shareText?.trim() || null,
    measurementDeltaSummary: input.consent.showMeasurementDelta
      ? input.consent.measurementDeltaSummary?.trim() || null
      : null,
  };
  const publicDisplay = buildPublicDisplayFromConsent({
    shareType: existing.shareType,
    consent,
    introducerDisplayName: input.displayName,
    dayCount: input.dayCount,
  });

  // Rotate token on activate so pending_consent token is not guessable from earlier leaks.
  const plaintextToken = generateGrowthShareToken();
  const tokenHash = hashGrowthShareToken(plaintextToken);

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_shares")
    .update({
      status: "active",
      token_hash: tokenHash,
      consent_snapshot_json: consent,
      public_display_json: publicDisplay,
      activated_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", input.shareId)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("introducer_customer_id", input.customerId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new CoachingServiceError(error?.message || "無法啟用分享連結。", error ? 500 : 404);
  }

  const share = mapGrowthShareRow(data as Record<string, unknown>);
  return {
    share,
    plaintextToken,
    publicPath: `/r/${plaintextToken}`,
  };
}

export async function customerDeclineGrowthShare(input: {
  ownerMemberId: string;
  customerId: string;
  shareId: string;
}): Promise<GrowthShareRecord> {
  const existing = await loadShareForCustomer(input);
  if (existing.status === "revoked") {
    return existing;
  }
  const nowIso = new Date().toISOString();
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_shares")
    .update({
      status: "declined",
      customer_declined_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", input.shareId)
    .eq("owner_member_id", input.ownerMemberId)
    .eq("introducer_customer_id", input.customerId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    throw new CoachingServiceError(error?.message || "無法記錄婉拒。", error ? 500 : 404);
  }

  // Mirror decline onto growth opportunity when linked (cooldown path via 4e status).
  if (existing.growthOpportunityId && existing.enrollmentId) {
    await supabase
      .from("growth_opportunities")
      .update({
        status: "declined",
        updated_at: nowIso,
        last_evaluated_at: nowIso,
      })
      .eq("id", existing.growthOpportunityId)
      .eq("owner_member_id", input.ownerMemberId);
  }

  return mapGrowthShareRow(data as Record<string, unknown>);
}

export function buildPortalShareCardView(input: {
  share: GrowthShareRecord;
  acceptsNewReferral?: boolean;
}): {
  shareId: string;
  shareType: GrowthShareRecord["shareType"];
  status: GrowthShareRecord["status"];
  ctaTitle: string;
  ctaBody: string;
  preview: PublicSharePayload;
} {
  const share = input.share;
  const ctaTitle =
    share.shareType === "outcome_share"
      ? "分享我的成果"
      : share.shareType === "friend_benefit"
        ? "分享朋友專屬體驗"
        : "分享給朋友";
  const ctaBody =
    share.shareType === "outcome_share"
      ? "最近的改變值得記錄一下 ✨ 要不要把這段成果分享給朋友？"
      : "如果你身邊也有人正在為體態或生活習慣煩惱，你可以把這個體驗分享給他。";

  const accepts =
    input.acceptsNewReferral ??
    isShareAcceptingReferrals({
      status: share.status,
      expiresAt: share.expiresAt,
      asOfMs: Date.now(),
    });

  return {
    shareId: share.id,
    shareType: share.shareType,
    status: share.status,
    ctaTitle,
    ctaBody,
    preview: toPublicSharePayload({
      shareId: share.id,
      shareType: share.shareType,
      publicDisplay: share.publicDisplay,
      benefit: share.benefit,
      acceptsNewReferral: accepts,
    }),
  };
}
