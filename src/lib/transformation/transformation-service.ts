import { createHash, randomBytes } from "crypto";
import { resolveIsSuperAdmin } from "@/lib/auth/super-admin";
import { buildPublicShareUrl, getPublicAppOrigin } from "@/lib/app/public-origin";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import {
  TRANSFORMATION_GOALS,
  TRANSFORMATION_LANDING_PAGE_VERSION,
  TRANSFORMATION_LEAD_STATUSES,
  TRANSFORMATION_LOST_REASONS,
  TRANSFORMATION_PAIN_POINTS,
  type TransformationAttribution,
  type TransformationLeadStatus,
  type TransformationLostReason,
  type TransformationPublicSubmitInput,
} from "@/lib/transformation/transformation-contract";
import {
  formatTaiwanMobilePhone,
  isValidTaiwanMobilePhone,
} from "@/lib/transformation/transformation-phone";

export class TransformationError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "TransformationError";
    this.status = status;
    this.code = code;
  }
}

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new TransformationError("Transformation service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

export function normalizeTransformationShareCode(code: string | null | undefined): string | null {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(normalized)) return null;
  return normalized;
}

function generateTransformationShareCode(length = 8): string {
  return randomBytes(length)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length)
    .toUpperCase();
}

function clip(value: string | null | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function normalizeContactPiece(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[\s\-()]+/g, "");
}

export function buildTransformationContactFingerprint(input: {
  phone: string;
  socialContact?: string | null;
}): string {
  const parts = [
    `phone:${normalizeContactPiece(input.phone)}`,
    `social:${normalizeContactPiece(input.socialContact)}`,
  ];
  const material = parts.join("|");
  return createHash("sha256").update(material).digest("hex");
}

export type TransformationShareLinkView = {
  shareCode: string;
  href: string;
  display: string;
  previewPath: string;
};

export async function getOrCreateTransformationShareLink(
  ownerMemberId: string,
): Promise<TransformationShareLinkView> {
  const isOwner = await resolveIsSuperAdmin(ownerMemberId);
  if (!isOwner) {
    throw new TransformationError("Transformation funnel is owner-only in V1.", 403, "owner_only");
  }

  const supabase = requireService();
  const { data: existing, error: existingError } = await supabase
    .from("transformation_share_links")
    .select("share_code")
    .eq("owner_member_id", ownerMemberId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    throw new TransformationError(existingError.message, 500, "share_lookup_failed");
  }

  let shareCode = existing?.share_code ? String(existing.share_code) : null;
  if (!shareCode) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateTransformationShareCode();
      const { data: inserted, error: insertError } = await supabase
        .from("transformation_share_links")
        .insert({
          owner_member_id: ownerMemberId,
          share_code: candidate,
          is_active: true,
        })
        .select("share_code")
        .single();
      if (!insertError && inserted?.share_code) {
        shareCode = String(inserted.share_code);
        break;
      }
      if (insertError && !/duplicate|unique/i.test(insertError.message)) {
        throw new TransformationError(insertError.message, 500, "share_create_failed");
      }
    }
  }
  if (!shareCode) {
    throw new TransformationError("Failed to allocate transformation share code.", 500, "share_create_failed");
  }

  const path = `/transform/${shareCode}`;
  const href = buildPublicShareUrl(path, getPublicAppOrigin());
  return {
    shareCode,
    href,
    display: href.replace(/^https?:\/\//, ""),
    previewPath: path,
  };
}

export type ResolvedTransformationOwner = {
  ownerPartnerId: string;
  shareCode: string;
};

export async function resolveActiveTransformationOwnerByCode(
  rawCode: string,
): Promise<ResolvedTransformationOwner> {
  const shareCode = normalizeTransformationShareCode(rawCode);
  if (!shareCode) {
    throw new TransformationError("連結無效。", 404, "invalid_code");
  }
  const supabase = requireService();
  const { data: link, error: linkError } = await supabase
    .from("transformation_share_links")
    .select("owner_member_id, share_code, is_active")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (linkError) {
    throw new TransformationError(linkError.message, 500, "resolve_failed");
  }
  if (!link?.is_active || !link.owner_member_id) {
    throw new TransformationError("連結無效或已停用。", 404, "invalid_code");
  }

  const ownerPartnerId = String(link.owner_member_id);
  const isOwner = await resolveIsSuperAdmin(ownerPartnerId);
  if (!isOwner) {
    throw new TransformationError("連結無效或已停用。", 404, "invalid_code");
  }

  return { ownerPartnerId, shareCode: String(link.share_code) };
}

export type ValidatedTransformationSubmit = {
  name: string;
  phone: string;
  socialContact: string | null;
  goal: string;
  targetAreaOrProblem: string;
  painPoint: string;
  contactFingerprint: string;
  attribution: TransformationAttribution;
  source: string | null;
  landingPath: string | null;
  referrer: string | null;
  landingPageVersion: string;
};

export function validateTransformationPublicSubmit(
  input: TransformationPublicSubmitInput,
): ValidatedTransformationSubmit {
  const name = clip(input.name, 80);
  if (!name) {
    throw new TransformationError("請填寫姓名／稱呼。", 400, "name_required");
  }

  const phoneRaw = clip(input.phone, 20);
  if (!phoneRaw || !isValidTaiwanMobilePhone(phoneRaw)) {
    throw new TransformationError("請填寫有效的台灣手機號碼。", 400, "phone_invalid");
  }
  const phone = formatTaiwanMobilePhone(phoneRaw);

  const socialContact = clip(input.socialContact, 120) || null;

  const goal = clip(input.goal, 80);
  if (!goal || !(TRANSFORMATION_GOALS as readonly string[]).includes(goal)) {
    throw new TransformationError("請選擇希望改善的項目。", 400, "goal_invalid");
  }

  const targetAreaOrProblem = clip(input.targetAreaOrProblem, 500);
  if (!targetAreaOrProblem) {
    throw new TransformationError("請填寫最想改善的部位或問題。", 400, "target_required");
  }

  const painPoint = clip(input.painPoint, 120);
  if (!painPoint || !(TRANSFORMATION_PAIN_POINTS as readonly string[]).includes(painPoint)) {
    throw new TransformationError("請選擇目前最困擾你的原因。", 400, "pain_invalid");
  }

  if (input.consentAccepted !== true) {
    throw new TransformationError("請勾選同意條款後再送出。", 400, "consent_required");
  }

  const attr = input.attribution ?? {};
  const attribution: TransformationAttribution = {
    utmSource: clip(attr.utmSource, 200) || null,
    utmMedium: clip(attr.utmMedium, 200) || null,
    utmCampaign: clip(attr.utmCampaign, 200) || null,
    utmContent: clip(attr.utmContent, 200) || null,
    utmTerm: clip(attr.utmTerm, 200) || null,
    fbclid: clip(attr.fbclid, 200) || null,
    campaignId: clip(attr.campaignId, 200) || null,
    adsetId: clip(attr.adsetId, 200) || null,
    adId: clip(attr.adId, 200) || null,
    placement: clip(attr.placement, 200) || null,
  };

  return {
    name,
    phone,
    socialContact,
    goal,
    targetAreaOrProblem,
    painPoint,
    contactFingerprint: buildTransformationContactFingerprint({ phone, socialContact }),
    attribution,
    source: clip(input.source, 120) || null,
    landingPath: clip(input.landingPath, 500) || null,
    referrer: clip(input.referrer, 500) || null,
    landingPageVersion: clip(input.landingPageVersion, 40) || TRANSFORMATION_LANDING_PAGE_VERSION,
  };
}

export type TransformationLeadRecord = {
  id: string;
  ownerPartnerId: string;
  shareCode: string;
  name: string;
  phone: string;
  socialContact: string | null;
  goal: string;
  targetAreaOrProblem: string;
  painPoint: string;
  status: TransformationLeadStatus;
  lostReason: TransformationLostReason | null;
  notes: string | null;
  customerId: string | null;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  placement: string | null;
  landingPageVersion: string;
  landingPath: string | null;
  referrer: string | null;
  contactedAt: string | null;
  qualifiedAt: string | null;
  appointmentAt: string | null;
  showedAt: string | null;
  convertedAt: string | null;
  lostAt: string | null;
  createdAt: string;
  updatedAt: string;
  duplicateOfExisting?: boolean;
};

function mapLeadRow(row: Record<string, unknown>, duplicateOfExisting = false): TransformationLeadRecord {
  return {
    id: String(row.id),
    ownerPartnerId: String(row.owner_partner_id),
    shareCode: String(row.share_code),
    name: String(row.name),
    phone: String(row.phone),
    socialContact: row.social_contact == null ? null : String(row.social_contact),
    goal: String(row.goal),
    targetAreaOrProblem: String(row.target_area_or_problem),
    painPoint: String(row.pain_point),
    status: row.status as TransformationLeadStatus,
    lostReason: row.lost_reason == null ? null : (row.lost_reason as TransformationLostReason),
    notes: row.notes == null ? null : String(row.notes),
    customerId: row.customer_id == null ? null : String(row.customer_id),
    source: row.source == null ? null : String(row.source),
    utmSource: row.utm_source == null ? null : String(row.utm_source),
    utmMedium: row.utm_medium == null ? null : String(row.utm_medium),
    utmCampaign: row.utm_campaign == null ? null : String(row.utm_campaign),
    utmContent: row.utm_content == null ? null : String(row.utm_content),
    utmTerm: row.utm_term == null ? null : String(row.utm_term),
    fbclid: row.fbclid == null ? null : String(row.fbclid),
    campaignId: row.campaign_id == null ? null : String(row.campaign_id),
    adsetId: row.adset_id == null ? null : String(row.adset_id),
    adId: row.ad_id == null ? null : String(row.ad_id),
    placement: row.placement == null ? null : String(row.placement),
    landingPageVersion: String(row.landing_page_version ?? TRANSFORMATION_LANDING_PAGE_VERSION),
    landingPath: row.landing_path == null ? null : String(row.landing_path),
    referrer: row.referrer == null ? null : String(row.referrer),
    contactedAt: row.contacted_at == null ? null : String(row.contacted_at),
    qualifiedAt: row.qualified_at == null ? null : String(row.qualified_at),
    appointmentAt: row.appointment_at == null ? null : String(row.appointment_at),
    showedAt: row.showed_at == null ? null : String(row.showed_at),
    convertedAt: row.converted_at == null ? null : String(row.converted_at),
    lostAt: row.lost_at == null ? null : String(row.lost_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    duplicateOfExisting,
  };
}

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function submitTransformationLead(
  input: TransformationPublicSubmitInput,
): Promise<TransformationLeadRecord> {
  const owner = await resolveActiveTransformationOwnerByCode(input.shareCode);
  const validated = validateTransformationPublicSubmit(input);
  const supabase = requireService();
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  const { data: recent, error: recentError } = await supabase
    .from("transformation_leads")
    .select("*")
    .eq("owner_partner_id", owner.ownerPartnerId)
    .eq("contact_fingerprint", validated.contactFingerprint)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentError) {
    throw new TransformationError(recentError.message, 500, "dedupe_lookup_failed");
  }
  if (recent) {
    return mapLeadRow(recent as Record<string, unknown>, true);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("transformation_leads")
    .insert({
      owner_partner_id: owner.ownerPartnerId,
      share_code: owner.shareCode,
      name: validated.name,
      phone: validated.phone,
      social_contact: validated.socialContact,
      goal: validated.goal,
      target_area_or_problem: validated.targetAreaOrProblem,
      pain_point: validated.painPoint,
      contact_fingerprint: validated.contactFingerprint,
      status: "new",
      consent_accepted_at: now,
      source: validated.source,
      utm_source: validated.attribution.utmSource,
      utm_medium: validated.attribution.utmMedium,
      utm_campaign: validated.attribution.utmCampaign,
      utm_content: validated.attribution.utmContent,
      utm_term: validated.attribution.utmTerm,
      fbclid: validated.attribution.fbclid,
      campaign_id: validated.attribution.campaignId,
      adset_id: validated.attribution.adsetId,
      ad_id: validated.attribution.adId,
      placement: validated.attribution.placement,
      landing_page_version: validated.landingPageVersion,
      landing_path: validated.landingPath,
      referrer: validated.referrer,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new TransformationError(error?.message || "Failed to save lead.", 500, "insert_failed");
  }
  return mapLeadRow(data as Record<string, unknown>, false);
}

export async function listTransformationLeadsForAdmin(input?: {
  status?: string | null;
}): Promise<TransformationLeadRecord[]> {
  const supabase = requireService();
  let query = supabase
    .from("transformation_leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (input?.status && (TRANSFORMATION_LEAD_STATUSES as readonly string[]).includes(input.status)) {
    query = query.eq("status", input.status);
  }
  const { data, error } = await query;
  if (error) {
    throw new TransformationError(error.message, 500, "admin_list_failed");
  }
  return (data ?? []).map((row) => mapLeadRow(row as Record<string, unknown>));
}

export async function getTransformationLeadForAdmin(leadId: string): Promise<TransformationLeadRecord> {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("transformation_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (error) {
    throw new TransformationError(error.message, 500, "get_failed");
  }
  if (!data) {
    throw new TransformationError("找不到這筆名單。", 404, "not_found");
  }
  return mapLeadRow(data as Record<string, unknown>);
}

const STATUS_TIMESTAMP_FIELD: Partial<Record<TransformationLeadStatus, string>> = {
  contacted: "contacted_at",
  qualified: "qualified_at",
  appointment: "appointment_at",
  showed: "showed_at",
  converted: "converted_at",
  lost: "lost_at",
};

export async function updateTransformationLeadForAdmin(input: {
  leadId: string;
  status?: string;
  lostReason?: string | null;
  notes?: string | null;
  customerId?: string | null;
  appointmentAt?: string | null;
}): Promise<TransformationLeadRecord> {
  const supabase = requireService();
  const existing = await getTransformationLeadForAdmin(input.leadId);

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.notes !== undefined) {
    patch.notes = input.notes == null ? null : clip(input.notes, 4000);
  }

  if (input.status !== undefined) {
    if (!(TRANSFORMATION_LEAD_STATUSES as readonly string[]).includes(input.status)) {
      throw new TransformationError("狀態無效。", 400, "status_invalid");
    }
    const nextStatus = input.status as TransformationLeadStatus;
    patch.status = nextStatus;

    const tsField = STATUS_TIMESTAMP_FIELD[nextStatus];
    if (tsField) {
      patch[tsField] = new Date().toISOString();
    }

    if (nextStatus === "lost") {
      const reason = input.lostReason ?? existing.lostReason;
      if (!reason || !(TRANSFORMATION_LOST_REASONS as readonly string[]).includes(reason)) {
        throw new TransformationError("請選擇流失原因。", 400, "lost_reason_required");
      }
      patch.lost_reason = reason;
    } else {
      patch.lost_reason = null;
    }

    if (nextStatus === "appointment" && input.appointmentAt) {
      patch.appointment_at = input.appointmentAt;
    }

    if (nextStatus === "converted") {
      if (input.customerId) {
        patch.customer_id = input.customerId;
      }
    } else if (input.customerId !== undefined && input.customerId !== null) {
      throw new TransformationError("僅能在已轉換狀態連結顧客。", 400, "customer_before_conversion");
    }

    if (nextStatus !== "converted" && existing.customerId) {
      throw new TransformationError("已連結顧客的名單不可改回未轉換狀態。", 400, "customer_locked");
    }
  }

  if (input.customerId !== undefined && patch.status !== "converted" && input.status === undefined) {
    if (existing.status !== "converted") {
      throw new TransformationError("僅能在已轉換狀態連結顧客。", 400, "customer_before_conversion");
    }
    patch.customer_id = input.customerId;
  }

  const { data, error } = await supabase
    .from("transformation_leads")
    .update(patch)
    .eq("id", input.leadId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw new TransformationError(error.message, 500, "update_failed");
  }
  if (!data) {
    throw new TransformationError("找不到這筆名單。", 404, "not_found");
  }
  return mapLeadRow(data as Record<string, unknown>);
}

export async function deleteTransformationLeadForAdmin(leadId: string): Promise<{ id: string }> {
  const supabase = requireService();
  await getTransformationLeadForAdmin(leadId);
  const { error } = await supabase.from("transformation_leads").delete().eq("id", leadId);
  if (error) {
    throw new TransformationError(error.message, 500, "delete_failed");
  }
  return { id: leadId };
}
