import type {
  FriendBenefitConfig,
  GrowthShareConsentSnapshot,
  GrowthSharePublicDisplay,
  GrowthShareRecord,
  GrowthShareStatus,
  GrowthShareType,
  ReferralAttributionRecord,
  ReferralAttributionStatus,
} from "@/types/coaching-referral-share";
import {
  isGrowthShareStatus,
  isGrowthShareType,
  isReferralAttributionStatus,
} from "@/types/coaching-referral-share";
import { buildDefaultBenefit, defaultBodyCopyForShareType, defaultHeadlineForShareType } from "@/lib/coaching/referral-share/public-payload";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function mapConsentSnapshot(raw: unknown): GrowthShareConsentSnapshot {
  const o = asObject(raw);
  return {
    consentedAt: o.consentedAt != null ? String(o.consentedAt) : null,
    consentedBy: o.consentedBy === "customer" ? "customer" : null,
    showIntroducerName: Boolean(o.showIntroducerName),
    showDayCount: Boolean(o.showDayCount),
    showMeasurementDelta: Boolean(o.showMeasurementDelta),
    shareText: o.shareText != null ? String(o.shareText) : null,
    measurementDeltaSummary:
      o.measurementDeltaSummary != null ? String(o.measurementDeltaSummary) : null,
  };
}

export function mapPublicDisplay(raw: unknown, shareType: GrowthShareType): GrowthSharePublicDisplay {
  const o = asObject(raw);
  return {
    showIntroducerName: Boolean(o.showIntroducerName),
    introducerDisplayName:
      o.introducerDisplayName != null ? String(o.introducerDisplayName) : null,
    showDayCount: Boolean(o.showDayCount),
    dayCount: typeof o.dayCount === "number" ? o.dayCount : o.dayCount != null ? Number(o.dayCount) : null,
    shareText: o.shareText != null ? String(o.shareText) : null,
    showMeasurementDelta: Boolean(o.showMeasurementDelta),
    measurementDeltaSummary:
      o.measurementDeltaSummary != null ? String(o.measurementDeltaSummary) : null,
    headline: o.headline != null ? String(o.headline) : defaultHeadlineForShareType(shareType),
    bodyCopy: o.bodyCopy != null ? String(o.bodyCopy) : defaultBodyCopyForShareType(shareType),
  };
}

export function mapBenefit(raw: unknown, shareType: GrowthShareType): FriendBenefitConfig {
  const o = asObject(raw);
  if (Object.keys(o).length === 0) return buildDefaultBenefit(shareType);
  return {
    benefitType: o.benefitType != null ? String(o.benefitType) : buildDefaultBenefit(shareType).benefitType,
    benefitLabel: o.benefitLabel != null ? String(o.benefitLabel) : buildDefaultBenefit(shareType).benefitLabel,
    optionalCode: o.optionalCode != null ? String(o.optionalCode) : null,
    activeFrom: o.activeFrom != null ? String(o.activeFrom) : null,
    activeUntil: o.activeUntil != null ? String(o.activeUntil) : null,
  };
}

export function mapGrowthShareRow(row: Record<string, unknown>): GrowthShareRecord {
  const shareTypeRaw = String(row.share_type ?? "");
  const shareType: GrowthShareType = isGrowthShareType(shareTypeRaw) ? shareTypeRaw : "coach_referral";
  const statusRaw = String(row.status ?? "pending_consent");
  const status: GrowthShareStatus = isGrowthShareStatus(statusRaw) ? statusRaw : "pending_consent";
  return {
    id: String(row.id),
    ownerMemberId: String(row.owner_member_id),
    introducerCustomerId: String(row.introducer_customer_id),
    enrollmentId: row.enrollment_id != null ? String(row.enrollment_id) : null,
    growthOpportunityId: row.growth_opportunity_id != null ? String(row.growth_opportunity_id) : null,
    shareType,
    tokenHash: String(row.token_hash),
    status,
    consentSnapshot: mapConsentSnapshot(row.consent_snapshot_json),
    publicDisplay: mapPublicDisplay(row.public_display_json, shareType),
    benefit: mapBenefit(row.benefit_json, shareType),
    customerDeclinedAt: row.customer_declined_at != null ? String(row.customer_declined_at) : null,
    activatedAt: row.activated_at != null ? String(row.activated_at) : null,
    revokedAt: row.revoked_at != null ? String(row.revoked_at) : null,
    pausedAt: row.paused_at != null ? String(row.paused_at) : null,
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function mapAttributionRow(row: Record<string, unknown>): ReferralAttributionRecord {
  const statusRaw = String(row.status ?? "visited");
  const status: ReferralAttributionStatus = isReferralAttributionStatus(statusRaw)
    ? statusRaw
    : "visited";
  return {
    id: String(row.id),
    ownerMemberId: String(row.owner_member_id),
    shareId: String(row.share_id),
    introducerCustomerId: String(row.introducer_customer_id),
    introducedCustomerId:
      row.introduced_customer_id != null ? String(row.introduced_customer_id) : null,
    status,
    leadDisplayName: row.lead_display_name != null ? String(row.lead_display_name) : null,
    leadPhone: row.lead_phone != null ? String(row.lead_phone) : null,
    leadLineId: row.lead_line_id != null ? String(row.lead_line_id) : null,
    leadGoalText: row.lead_goal_text != null ? String(row.lead_goal_text) : null,
    linkedExistingCustomer: Boolean(row.linked_existing_customer),
    coachHandledAt: row.coach_handled_at != null ? String(row.coach_handled_at) : null,
    firstTouchAt: String(row.first_touch_at ?? row.created_at ?? ""),
    interestedAt: row.interested_at != null ? String(row.interested_at) : null,
    submittedAt: row.submitted_at != null ? String(row.submitted_at) : null,
    convertedAt: row.converted_at != null ? String(row.converted_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
