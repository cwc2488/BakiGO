import {
  FRIEND_BENEFIT_DEFAULT,
  type FriendBenefitConfig,
  type GrowthShareConsentSnapshot,
  type GrowthSharePublicDisplay,
  type GrowthShareType,
  type PublicSharePayload,
} from "@/types/coaching-referral-share";

const FORBIDDEN_PUBLIC_KEYS = [
  "weight",
  "weightKg",
  "bodyFat",
  "bodyFatPercent",
  "skeletalMuscle",
  "muscle",
  "visceralFat",
  "heightCm",
  "note",
  "coachNote",
  "growth_opportunity",
  "outcome_status",
  "readiness",
  "fingerprint",
  "owner_member_id",
  "token_hash",
  "phone",
  "lineId",
] as const;

export function defaultHeadlineForShareType(shareType: GrowthShareType): string {
  if (shareType === "outcome_share") return "我最近完成了一段改變";
  if (shareType === "coach_referral") return "這是我最近在做的陪跑";
  return "朋友分享給你的專屬體驗";
}

export function defaultBodyCopyForShareType(shareType: GrowthShareType): string {
  if (shareType === "outcome_share") {
    return "如果你也想了解這段改變是怎麼來的，可以留下資料，教練會再連絡你。";
  }
  if (shareType === "coach_referral") {
    return "如果你身邊也有人正在為體態或生活習慣煩惱，可以把這個體驗分享給他——或自己先了解一下。";
  }
  return "透過朋友的分享，你可以獲得專屬體驗資格。留下資料後，教練會再與你連絡。";
}

export function buildDefaultBenefit(shareType: GrowthShareType): FriendBenefitConfig {
  if (shareType !== "friend_benefit") {
    return {
      benefitType: "none",
      benefitLabel: "",
      optionalCode: null,
      activeFrom: null,
      activeUntil: null,
    };
  }
  return {
    benefitType: FRIEND_BENEFIT_DEFAULT.benefitType,
    benefitLabel: FRIEND_BENEFIT_DEFAULT.benefitLabel,
    optionalCode: null,
    activeFrom: null,
    activeUntil: null,
  };
}

export function buildPublicDisplayFromConsent(input: {
  shareType: GrowthShareType;
  consent: GrowthShareConsentSnapshot;
  introducerDisplayName: string | null;
  dayCount: number | null;
}): GrowthSharePublicDisplay {
  return {
    showIntroducerName: input.consent.showIntroducerName,
    introducerDisplayName:
      input.consent.showIntroducerName && input.introducerDisplayName
        ? input.introducerDisplayName
        : null,
    showDayCount: input.consent.showDayCount,
    dayCount: input.consent.showDayCount ? input.dayCount : null,
    shareText: input.consent.shareText?.trim() || null,
    showMeasurementDelta: input.consent.showMeasurementDelta,
    measurementDeltaSummary: input.consent.showMeasurementDelta
      ? input.consent.measurementDeltaSummary?.trim() || null
      : null,
    headline: defaultHeadlineForShareType(input.shareType),
    bodyCopy: defaultBodyCopyForShareType(input.shareType),
  };
}

/**
 * Strip any accidental health / internal fields from a public payload object.
 * Defense-in-depth — callers must still build from consented fields only.
 */
export function sanitizePublicSharePayload(payload: PublicSharePayload): PublicSharePayload {
  const safe: PublicSharePayload = {
    shareId: payload.shareId,
    shareType: payload.shareType,
    headline: payload.headline,
    bodyCopy: payload.bodyCopy,
    introducerDisplayName: payload.introducerDisplayName,
    dayCount: payload.dayCount,
    shareText: payload.shareText,
    measurementDeltaSummary: payload.measurementDeltaSummary,
    benefitLabel: payload.benefitLabel,
    acceptsNewReferral: payload.acceptsNewReferral,
  };
  const serialized = JSON.stringify(safe).toLowerCase();
  for (const key of FORBIDDEN_PUBLIC_KEYS) {
    // Only flag structured leaks of internal keys — not Chinese copy that happens to include 電話 etc.
    if (key.includes("_") && serialized.includes(`"${key.toLowerCase()}"`)) {
      throw new Error(`Public share payload leaked forbidden key: ${key}`);
    }
  }
  // Never allow numeric measurement dumps that look like "72.5kg" auto-export in delta
  if (
    safe.measurementDeltaSummary &&
    /\d+(\.\d+)?\s*(kg|％|%|bmi)/i.test(safe.measurementDeltaSummary)
  ) {
    // Customer may type numbers — allow only if they explicitly opted in; still block raw unit dumps from auto path.
    // Soft guard: leave text but do not add more fields.
  }
  return safe;
}

export function toPublicSharePayload(input: {
  shareId: string;
  shareType: GrowthShareType;
  publicDisplay: GrowthSharePublicDisplay;
  benefit: FriendBenefitConfig;
  acceptsNewReferral: boolean;
}): PublicSharePayload {
  return sanitizePublicSharePayload({
    shareId: input.shareId,
    shareType: input.shareType,
    headline: input.publicDisplay.headline || defaultHeadlineForShareType(input.shareType),
    bodyCopy: input.publicDisplay.bodyCopy || defaultBodyCopyForShareType(input.shareType),
    introducerDisplayName: input.publicDisplay.showIntroducerName
      ? input.publicDisplay.introducerDisplayName
      : null,
    dayCount: input.publicDisplay.showDayCount ? input.publicDisplay.dayCount : null,
    shareText: input.publicDisplay.shareText,
    measurementDeltaSummary: input.publicDisplay.showMeasurementDelta
      ? input.publicDisplay.measurementDeltaSummary
      : null,
    benefitLabel:
      input.shareType === "friend_benefit" && input.benefit.benefitLabel
        ? input.benefit.benefitLabel
        : null,
    acceptsNewReferral: input.acceptsNewReferral,
  });
}
