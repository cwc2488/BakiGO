import { randomBytes } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Go21CustomerProfileSync = {
  displayName?: string | null;
  phone?: string | null;
  lineId?: string | null;
  heightCm?: number | null;
  sex?: string | null;
  birthYear?: number | null;
  birthDate?: string | null;
};

/**
 * Ensure the customer row exists in cloud for this owner.
 * Local CRM customers are often created before cloud sync finishes — activation
 * must not fail with a silent Forbidden when the local record is valid.
 */
export async function ensureOwnedCloudCustomer(input: {
  ownerMemberId: string;
  customerId: string;
  profile?: Go21CustomerProfileSync | null;
}): Promise<{ id: string; displayName: string }> {
  if (!isCloudDatabaseMemberId(input.ownerMemberId)) {
    throw new CoachingServiceError("請先使用雲端帳號登入後再開通 Baki Go 21", 403);
  }
  if (!UUID_RE.test(input.customerId)) {
    throw new CoachingServiceError("顧客資料尚未就緒，請回到顧客列表重新整理後再試", 400);
  }

  const supabase = createSupabaseServiceClient();
  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("id, display_name, owner_member_id, deleted_at")
    .eq("id", input.customerId)
    .maybeSingle();

  if (existingError) {
    throw new CoachingServiceError(existingError.message, 500);
  }

  if (existing) {
    if (existing.deleted_at) {
      throw new CoachingServiceError("這位顧客已刪除，無法開通", 409);
    }
    if (String(existing.owner_member_id) !== input.ownerMemberId) {
      throw new CoachingServiceError("Forbidden", 403);
    }
    const displayName = String(existing.display_name || "").trim() || "顧客";
    // Optionally refresh blank names from client profile
    const nextName = input.profile?.displayName?.trim();
    if (nextName && displayName === "顧客") {
      await supabase
        .from("customers")
        .update({ display_name: nextName, updated_at: new Date().toISOString() })
        .eq("id", input.customerId)
        .eq("owner_member_id", input.ownerMemberId);
      return { id: input.customerId, displayName: nextName };
    }
    return { id: input.customerId, displayName };
  }

  const displayName =
    input.profile?.displayName?.trim() ||
    "顧客";

  const { error: insertError } = await supabase.from("customers").insert({
    id: input.customerId,
    owner_member_id: input.ownerMemberId,
    display_name: displayName,
    phone: input.profile?.phone?.trim() || null,
    line_id: input.profile?.lineId?.trim() || null,
    height_cm: input.profile?.heightCm ?? null,
    sex: input.profile?.sex ?? null,
    birth_year: input.profile?.birthYear ?? null,
    birth_date: input.profile?.birthDate ?? null,
    status: "active",
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    // Race: another request inserted first — re-read as owned
    const { data: raced } = await supabase
      .from("customers")
      .select("id, display_name, owner_member_id, deleted_at")
      .eq("id", input.customerId)
      .maybeSingle();
    if (raced && !raced.deleted_at && String(raced.owner_member_id) === input.ownerMemberId) {
      return {
        id: input.customerId,
        displayName: String(raced.display_name || "").trim() || displayName,
      };
    }
    throw new CoachingServiceError(insertError.message, 500);
  }

  return { id: input.customerId, displayName };
}

/** Create or reuse an active portal token (service role — not browser RLS). */
export async function ensureCustomerPortalTokenServiceRole(
  customerId: string,
): Promise<{ token: string; created: boolean }> {
  if (!UUID_RE.test(customerId)) {
    throw new CoachingServiceError("invalid_customer_id", 400);
  }
  const supabase = createSupabaseServiceClient();
  const { data: existing, error } = await supabase
    .from("customer_portal_tokens")
    .select("token, revoked_at, expires_at")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new CoachingServiceError(error.message, 500);
  }

  const now = Date.now();
  if (
    existing?.token &&
    !existing.revoked_at &&
    !(existing.expires_at && new Date(existing.expires_at).getTime() <= now)
  ) {
    return { token: String(existing.token), created: false };
  }

  const token = randomBytes(24).toString("hex");
  if (existing) {
    const { data, error: updateError } = await supabase
      .from("customer_portal_tokens")
      .update({
        token,
        revoked_at: null,
        expires_at: null,
      })
      .eq("customer_id", customerId)
      .select("token")
      .single();
    if (updateError) {
      throw new CoachingServiceError(updateError.message, 500);
    }
    return { token: String(data.token), created: true };
  }

  const { data, error: insertError } = await supabase
    .from("customer_portal_tokens")
    .insert({
      customer_id: customerId,
      token,
      expires_at: null,
    })
    .select("token")
    .single();

  if (insertError) {
    throw new CoachingServiceError(insertError.message, 500);
  }
  return { token: String(data.token), created: true };
}
