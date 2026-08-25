import { createHash, randomBytes } from "crypto";
import {
  RECRUITMENT_AGE_RANGES,
  RECRUITMENT_LEAD_STATUSES,
  RECRUITMENT_MOTIVATIONS,
  RECRUITMENT_WEEKLY_AVAILABILITY,
  RECRUITMENT_WORK_STATUSES,
  type RecruitmentLeadStatus,
  type RecruitmentPublicSubmitInput,
  type RecruitmentUtmAttribution,
} from "@/lib/recruitment/recruitment-contract";
import { isValidTaiwanDevelopmentRegion } from "@/lib/radar/semantics/taiwan-development-regions";
import { buildPublicShareUrl, getPublicAppOrigin } from "@/lib/app/public-origin";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export class RecruitmentError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "RecruitmentError";
    this.status = status;
    this.code = code;
  }
}

function requireService() {
  if (!isSupabaseServiceConfigured()) {
    throw new RecruitmentError("Recruitment service unavailable.", 503, "service_unavailable");
  }
  return createSupabaseServiceClient();
}

export function normalizeRecruitmentShareCode(code: string | null | undefined): string | null {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(normalized)) return null;
  return normalized;
}

function generateRecruitmentShareCode(length = 8): string {
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

export function buildRecruitmentContactFingerprint(input: {
  instagram?: string | null;
  lineId?: string | null;
  phone?: string | null;
}): string {
  const parts = [
    `ig:${normalizeContactPiece(input.instagram)}`,
    `line:${normalizeContactPiece(input.lineId)}`,
    `phone:${normalizeContactPiece(input.phone)}`,
  ].filter((part) => !part.endsWith(":"));
  const material = parts.join("|") || "empty";
  return createHash("sha256").update(material).digest("hex");
}

export type RecruitmentShareLinkView = {
  shareCode: string;
  href: string;
  display: string;
  previewPath: string;
};

export async function getOrCreateRecruitmentShareLink(
  ownerMemberId: string,
): Promise<RecruitmentShareLinkView> {
  const supabase = requireService();
  const { data: existing, error: existingError } = await supabase
    .from("recruitment_share_links")
    .select("share_code")
    .eq("owner_member_id", ownerMemberId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    throw new RecruitmentError(existingError.message, 500, "share_lookup_failed");
  }

  let shareCode = existing?.share_code ? String(existing.share_code) : null;
  if (!shareCode) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateRecruitmentShareCode();
      const { data: inserted, error: insertError } = await supabase
        .from("recruitment_share_links")
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
        throw new RecruitmentError(insertError.message, 500, "share_create_failed");
      }
    }
  }
  if (!shareCode) {
    throw new RecruitmentError("Failed to allocate recruitment share code.", 500, "share_create_failed");
  }

  const path = `/join/${shareCode}`;
  const href = buildPublicShareUrl(path, getPublicAppOrigin());
  return {
    shareCode,
    href,
    display: href.replace(/^https?:\/\//, ""),
    previewPath: path,
  };
}

export type ResolvedRecruitmentPartner = {
  partnerMemberId: string;
  shareCode: string;
  partnerDisplayName: string | null;
};

export async function resolveActiveRecruitmentPartnerByCode(
  rawCode: string,
): Promise<ResolvedRecruitmentPartner> {
  const shareCode = normalizeRecruitmentShareCode(rawCode);
  if (!shareCode) {
    throw new RecruitmentError("招募連結無效。", 404, "invalid_code");
  }
  const supabase = requireService();
  const { data, error } = await supabase
    .from("recruitment_share_links")
    .select("share_code, owner_member_id, is_active, members:owner_member_id ( name, member_number )")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (error) {
    throw new RecruitmentError(error.message, 500, "partner_lookup_failed");
  }
  if (!data?.owner_member_id || data.is_active !== true) {
    throw new RecruitmentError("招募連結無效或已停用。", 404, "invalid_code");
  }
  const memberRaw = data.members as
    | { name?: string | null; member_number?: string | null }
    | Array<{ name?: string | null; member_number?: string | null }>
    | null;
  const member = Array.isArray(memberRaw) ? memberRaw[0] ?? null : memberRaw;
  return {
    partnerMemberId: String(data.owner_member_id),
    shareCode,
    partnerDisplayName: member?.name?.trim() || member?.member_number?.trim() || null,
  };
}

function assertEnum<T extends string>(value: string, allowed: readonly T[], code: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new RecruitmentError("表單內容無效。", 400, code);
}

export function validateRecruitmentPublicSubmit(input: RecruitmentPublicSubmitInput): {
  name: string;
  ageRange: string;
  city: string;
  district: string;
  workStatus: string;
  motivations: string[];
  weeklyAvailability: string;
  instagram: string | null;
  lineId: string | null;
  phone: string | null;
  contactFingerprint: string;
  utm: RecruitmentUtmAttribution;
  landingPath: string | null;
  referrer: string | null;
} {
  if (!input.consentAccepted) {
    throw new RecruitmentError("請先勾選資料使用同意。", 400, "consent_required");
  }
  const name = clip(input.name, 80);
  if (name.length < 1) {
    throw new RecruitmentError("請填寫稱呼。", 400, "name_required");
  }
  const ageRange = assertEnum(clip(input.ageRange, 20), RECRUITMENT_AGE_RANGES, "age_invalid");
  const city = clip(input.city, 40);
  const district = clip(input.district, 40);
  if (!isValidTaiwanDevelopmentRegion({ city, district })) {
    throw new RecruitmentError("請選擇有效的縣市與行政區。", 400, "region_invalid");
  }
  const workStatus = assertEnum(clip(input.workStatus, 40), RECRUITMENT_WORK_STATUSES, "work_invalid");
  const motivations = Array.isArray(input.motivations)
    ? [...new Set(input.motivations.map((item) => clip(item, 40)).filter(Boolean))]
    : [];
  if (motivations.length < 1) {
    throw new RecruitmentError("請至少選擇一項想改變的事情。", 400, "motivations_required");
  }
  for (const motivation of motivations) {
    assertEnum(motivation, RECRUITMENT_MOTIVATIONS, "motivations_invalid");
  }
  const weeklyAvailability = assertEnum(
    clip(input.weeklyAvailability, 40),
    RECRUITMENT_WEEKLY_AVAILABILITY,
    "availability_invalid",
  );
  const instagram = clip(input.instagram, 80) || null;
  const lineId = clip(input.lineId, 80) || null;
  const phone = clip(input.phone, 40) || null;
  if (!instagram && !lineId && !phone) {
    throw new RecruitmentError("請至少留下一種聯絡方式。", 400, "contact_required");
  }
  return {
    name,
    ageRange,
    city,
    district,
    workStatus,
    motivations,
    weeklyAvailability,
    instagram,
    lineId,
    phone,
    contactFingerprint: buildRecruitmentContactFingerprint({ instagram, lineId, phone }),
    utm: {
      utmSource: clip(input.utm?.utmSource, 200) || null,
      utmMedium: clip(input.utm?.utmMedium, 200) || null,
      utmCampaign: clip(input.utm?.utmCampaign, 200) || null,
      utmContent: clip(input.utm?.utmContent, 200) || null,
      utmTerm: clip(input.utm?.utmTerm, 200) || null,
    },
    landingPath: clip(input.landingPath, 300) || null,
    referrer: clip(input.referrer, 500) || null,
  };
}

export type RecruitmentLeadRecord = {
  id: string;
  partnerMemberId: string;
  shareCode: string;
  name: string;
  ageRange: string;
  city: string;
  district: string;
  workStatus: string;
  motivations: string[];
  weeklyAvailability: string;
  instagram: string | null;
  lineId: string | null;
  phone: string | null;
  status: RecruitmentLeadStatus;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPath: string | null;
  createdAt: string;
  updatedAt: string;
  duplicateOfExisting: boolean;
  partnerDisplayName?: string | null;
};

function mapLeadRow(row: Record<string, unknown>, duplicateOfExisting = false): RecruitmentLeadRecord {
  const motivations = Array.isArray(row.motivations)
    ? row.motivations.map((item) => String(item))
    : [];
  return {
    id: String(row.id),
    partnerMemberId: String(row.partner_member_id),
    shareCode: String(row.share_code),
    name: String(row.name),
    ageRange: String(row.age_range),
    city: String(row.city),
    district: String(row.district),
    workStatus: String(row.work_status),
    motivations,
    weeklyAvailability: String(row.weekly_availability),
    instagram: row.instagram ? String(row.instagram) : null,
    lineId: row.line_id ? String(row.line_id) : null,
    phone: row.phone ? String(row.phone) : null,
    status: row.status as RecruitmentLeadStatus,
    utmSource: row.utm_source ? String(row.utm_source) : null,
    utmMedium: row.utm_medium ? String(row.utm_medium) : null,
    utmCampaign: row.utm_campaign ? String(row.utm_campaign) : null,
    utmContent: row.utm_content ? String(row.utm_content) : null,
    utmTerm: row.utm_term ? String(row.utm_term) : null,
    landingPath: row.landing_path ? String(row.landing_path) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    duplicateOfExisting,
  };
}

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function submitRecruitmentLead(
  input: RecruitmentPublicSubmitInput,
): Promise<RecruitmentLeadRecord> {
  const partner = await resolveActiveRecruitmentPartnerByCode(input.shareCode);
  const validated = validateRecruitmentPublicSubmit(input);
  const supabase = requireService();
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  const { data: recent, error: recentError } = await supabase
    .from("recruitment_leads")
    .select("*")
    .eq("partner_member_id", partner.partnerMemberId)
    .eq("contact_fingerprint", validated.contactFingerprint)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentError) {
    throw new RecruitmentError(recentError.message, 500, "dedupe_lookup_failed");
  }
  if (recent) {
    return mapLeadRow(recent as Record<string, unknown>, true);
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("recruitment_leads")
    .insert({
      partner_member_id: partner.partnerMemberId,
      share_code: partner.shareCode,
      name: validated.name,
      age_range: validated.ageRange,
      city: validated.city,
      district: validated.district,
      work_status: validated.workStatus,
      motivations: validated.motivations,
      weekly_availability: validated.weeklyAvailability,
      instagram: validated.instagram,
      line_id: validated.lineId,
      phone: validated.phone,
      contact_fingerprint: validated.contactFingerprint,
      status: "new",
      consent_accepted_at: now,
      utm_source: validated.utm.utmSource,
      utm_medium: validated.utm.utmMedium,
      utm_campaign: validated.utm.utmCampaign,
      utm_content: validated.utm.utmContent,
      utm_term: validated.utm.utmTerm,
      landing_path: validated.landingPath,
      referrer: validated.referrer,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new RecruitmentError(error?.message || "Failed to save lead.", 500, "insert_failed");
  }
  return mapLeadRow(data as Record<string, unknown>, false);
}

export async function listRecruitmentLeadsForPartner(partnerMemberId: string): Promise<RecruitmentLeadRecord[]> {
  const supabase = requireService();
  const { data, error } = await supabase
    .from("recruitment_leads")
    .select("*")
    .eq("partner_member_id", partnerMemberId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new RecruitmentError(error.message, 500, "list_failed");
  }
  return (data ?? []).map((row) => mapLeadRow(row as Record<string, unknown>));
}

export async function updateRecruitmentLeadStatusForPartner(input: {
  partnerMemberId: string;
  leadId: string;
  status: string;
}): Promise<RecruitmentLeadRecord> {
  if (!(RECRUITMENT_LEAD_STATUSES as readonly string[]).includes(input.status)) {
    throw new RecruitmentError("狀態無效。", 400, "status_invalid");
  }
  const supabase = requireService();
  const { data, error } = await supabase
    .from("recruitment_leads")
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq("id", input.leadId)
    .eq("partner_member_id", input.partnerMemberId)
    .select("*")
    .maybeSingle();
  if (error) {
    throw new RecruitmentError(error.message, 500, "update_failed");
  }
  if (!data) {
    throw new RecruitmentError("找不到這筆名單。", 404, "not_found");
  }
  return mapLeadRow(data as Record<string, unknown>);
}

export async function listRecruitmentLeadsForAdmin(input?: {
  partnerMemberId?: string | null;
  status?: string | null;
}): Promise<RecruitmentLeadRecord[]> {
  const supabase = requireService();
  let query = supabase
    .from("recruitment_leads")
    .select("*, members:partner_member_id ( name, member_number )")
    .order("created_at", { ascending: false })
    .limit(500);
  if (input?.partnerMemberId) {
    query = query.eq("partner_member_id", input.partnerMemberId);
  }
  if (input?.status && (RECRUITMENT_LEAD_STATUSES as readonly string[]).includes(input.status)) {
    query = query.eq("status", input.status);
  }
  const { data, error } = await query;
  if (error) {
    throw new RecruitmentError(error.message, 500, "admin_list_failed");
  }
  return (data ?? []).map((row) => {
    const mapped = mapLeadRow(row as Record<string, unknown>);
    const memberRaw = (row as { members?: unknown }).members as
      | { name?: string | null; member_number?: string | null }
      | Array<{ name?: string | null; member_number?: string | null }>
      | null;
    const member = Array.isArray(memberRaw) ? memberRaw[0] ?? null : memberRaw;
    mapped.partnerDisplayName =
      member?.name?.trim() || member?.member_number?.trim() || mapped.partnerMemberId.slice(0, 8);
    return mapped;
  });
}
