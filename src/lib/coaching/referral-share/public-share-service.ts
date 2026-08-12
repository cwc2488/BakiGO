import { randomUUID } from "node:crypto";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { normalizeCustomerPhone } from "@/lib/customers/customer-profile";
import { decideFriendBConversion } from "@/lib/coaching/referral-share/conversion-policy";
import { toPublicSharePayload } from "@/lib/coaching/referral-share/public-payload";
import { isShareAcceptingReferrals } from "@/lib/coaching/referral-share/share-eligibility";
import {
  hashGrowthShareToken,
  isPlausibleGrowthShareToken,
} from "@/lib/coaching/referral-share/share-token";
import { mapAttributionRow, mapGrowthShareRow } from "@/lib/coaching/referral-share/mappers";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type {
  GrowthShareRecord,
  PublicSharePayload,
  ReferralAttributionRecord,
} from "@/types/coaching-referral-share";

async function findShareByToken(token: string): Promise<GrowthShareRecord | null> {
  if (!isPlausibleGrowthShareToken(token)) return null;
  const tokenHash = hashGrowthShareToken(token);
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("growth_shares")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    const message = error.message || "Failed to resolve share token.";
    if (message.includes("growth_shares") || message.includes("schema cache")) {
      throw new CoachingServiceError("分享服務尚未就緒，請稍後再試。", 503);
    }
    throw new CoachingServiceError(message, 500);
  }
  if (!data) return null;
  return mapGrowthShareRow(data as Record<string, unknown>);
}

export async function resolvePublicShareByToken(input: {
  token: string;
  asOfMs?: number;
}): Promise<{ payload: PublicSharePayload; share: GrowthShareRecord } | null> {
  const share = await findShareByToken(input.token);
  if (!share) return null;

  const asOfMs = input.asOfMs ?? Date.now();
  const accepts = isShareAcceptingReferrals({
    status: share.status,
    expiresAt: share.expiresAt,
    asOfMs,
  });

  return {
    share,
    payload: toPublicSharePayload({
      shareId: share.id,
      shareType: share.shareType,
      publicDisplay: share.publicDisplay,
      benefit: share.benefit,
      acceptsNewReferral: accepts,
    }),
  };
}

export async function submitFriendInterestByToken(input: {
  token: string;
  displayName: string;
  phone?: string | null;
  lineId?: string | null;
  goalText?: string | null;
  asOfMs?: number;
}): Promise<{
  attribution: ReferralAttributionRecord;
  customerId: string | null;
  linkedExisting: boolean;
  createdNew: boolean;
}> {
  const resolved = await resolvePublicShareByToken({
    token: input.token,
    asOfMs: input.asOfMs,
  });
  if (!resolved) {
    throw new CoachingServiceError("分享連結不存在或已失效。", 404);
  }
  const { share } = resolved;
  const asOfMs = input.asOfMs ?? Date.now();
  const accepts = isShareAcceptingReferrals({
    status: share.status,
    expiresAt: share.expiresAt,
    asOfMs,
  });
  if (!accepts) {
    throw new CoachingServiceError("此分享連結目前無法接受新朋友資料。", 410);
  }

  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new CoachingServiceError("請留下你的名字。", 400);
  }
  const phone = input.phone?.trim() || null;
  const lineId = input.lineId?.trim() || null;
  if (!phone && !lineId) {
    throw new CoachingServiceError("請留下電話或 LINE，方便教練連絡你。", 400);
  }

  const supabase = createSupabaseServiceClient();
  const { data: ownerCustomers, error: customerError } = await supabase
    .from("customers")
    .select("id, owner_member_id, display_name, phone, line_id")
    .eq("owner_member_id", share.ownerMemberId)
    .limit(5000);
  if (customerError) {
    throw new CoachingServiceError(customerError.message || "Failed to load customers.", 500);
  }

  const decision = decideFriendBConversion({
    ownerMemberId: share.ownerMemberId,
    leadDisplayName: displayName,
    leadPhone: phone,
    leadLineId: lineId,
    existingCustomers: (ownerCustomers ?? []).map((row) => ({
      id: String(row.id),
      ownerMemberId: String(row.owner_member_id),
      displayName: String(row.display_name),
      phone: row.phone != null ? String(row.phone) : null,
      lineId: (row as { line_id?: string | null }).line_id ?? null,
    })),
  });

  const nowIso = new Date(asOfMs).toISOString();
  let introducedCustomerId: string | null = null;
  let linkedExisting = false;
  let createdNew = false;
  let status: ReferralAttributionRecord["status"] = "submitted";

  if (decision.action === "link_existing") {
    introducedCustomerId = decision.customerId;
    linkedExisting = true;
    status = "customer_created";
  } else if (decision.action === "create_new") {
    const newId = randomUUID();
    const { error: insertError } = await supabase.from("customers").insert({
      id: newId,
      owner_member_id: share.ownerMemberId,
      display_name: displayName,
      phone: phone ? normalizeCustomerPhone(phone) || phone : null,
      line_id: lineId,
      note: input.goalText?.trim()
        ? `轉介紹意向：${input.goalText.trim()}`
        : "透過朋友分享留下資料",
      status: "active",
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (insertError) {
      throw new CoachingServiceError(insertError.message || "無法建立顧客資料。", 500);
    }
    introducedCustomerId = newId;
    createdNew = true;
    status = "customer_created";
  } else {
    // pending_only — keep attribution without Customer (name-only / insufficient)
    status = "submitted";
  }

  const { data, error } = await supabase
    .from("growth_referral_attributions")
    .insert({
      owner_member_id: share.ownerMemberId,
      share_id: share.id,
      introducer_customer_id: share.introducerCustomerId,
      introduced_customer_id: introducedCustomerId,
      status,
      lead_display_name: displayName,
      lead_phone: phone ? normalizeCustomerPhone(phone) || phone : null,
      lead_line_id: lineId,
      lead_goal_text: input.goalText?.trim() || null,
      linked_existing_customer: linkedExisting,
      first_touch_at: nowIso,
      interested_at: nowIso,
      submitted_at: nowIso,
      converted_at: introducedCustomerId ? nowIso : null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new CoachingServiceError(error?.message || "無法保存轉介紹資料。", 500);
  }

  if (status === "customer_created" && share.growthOpportunityId && createdNew) {
    await supabase
      .from("growth_opportunities")
      .update({
        status: "converted",
        updated_at: nowIso,
        last_evaluated_at: nowIso,
      })
      .eq("id", share.growthOpportunityId)
      .eq("owner_member_id", share.ownerMemberId);
  }

  return {
    attribution: mapAttributionRow(data as Record<string, unknown>),
    customerId: introducedCustomerId,
    linkedExisting,
    createdNew,
  };
}
