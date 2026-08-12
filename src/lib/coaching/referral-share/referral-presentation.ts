/**
 * Referral Center presentation state — deterministic, Coach-facing only.
 * Does NOT create a second Outcome / Growth authority.
 */

import type { GrowthPath } from "@/types/coaching-growth";
import type { GrowthShareType } from "@/types/coaching-referral-share";
import { growthPathToShareType } from "@/types/coaching-referral-share";

export const REFERRAL_UI_STATES = [
  "not_assessed",
  "nurturing",
  "ask_ready",
  "outcome_share_ready",
  "best_timing",
  "sharing_active",
  "has_referral",
  "pause_care_first",
] as const;

export type ReferralUiState = (typeof REFERRAL_UI_STATES)[number];

export const REFERRAL_UI_STATE_LABELS: Record<ReferralUiState, string> = {
  not_assessed: "尚未評估",
  nurturing: "持續培養",
  ask_ready: "適合詢問推薦",
  outcome_share_ready: "適合成果分享",
  best_timing: "最佳分享時機",
  sharing_active: "分享進行中",
  has_referral: "已產生轉介紹",
  pause_care_first: "目前先關心",
};

export type ReferralCandidateSignals = {
  customerId: string;
  displayName: string;
  hasEnrollment: boolean;
  enrollmentId: string | null;
  openOpportunity: {
    id: string;
    readiness: string;
    primaryGrowthPath: GrowthPath | null;
    secondaryPaths: GrowthPath[];
    blockedReasons: string[];
  } | null;
  latestCheckin: {
    struggleFlag: boolean;
    declineGrowthAsk: boolean;
    explicitReferralIntent: boolean;
    recommendationWillingness: number | null;
    experienceSatisfaction: number | null;
    coachHelpfulness: number | null;
  } | null;
  activeShare: { id: string; shareType: GrowthShareType; status: string } | null;
  pendingConsentShare: { id: string; shareType: GrowthShareType } | null;
  attributionCount: number;
  needsCoachAttribution: boolean;
  coachAttentionHint: boolean;
};

export type ReferralCandidateView = {
  customerId: string;
  customerName: string;
  enrollmentId: string | null;
  state: ReferralUiState;
  stateLabel: string;
  reason: string;
  nextActionLabel: string;
  canManualStart: boolean;
  startWarning: string | null;
  opportunityId: string | null;
  pendingShareId: string | null;
  suggestedShareTypes: GrowthShareType[];
  primaryCta: "start_share" | "view_customer" | "handle_friend" | "open_coaching" | "confirm_consent";
};

function hasRescueSignal(signals: ReferralCandidateSignals): boolean {
  if (signals.coachAttentionHint) return true;
  if (signals.latestCheckin?.struggleFlag) return true;
  if (signals.openOpportunity?.blockedReasons.some((code) =>
    ["rescue_active", "struggle_active", "coach_attention_active", "worsening_active"].includes(code),
  )) {
    return true;
  }
  return false;
}

/**
 * Priority (highest first):
 * has_referral → sharing_active → pause_care_first → best/ask/outcome → nurturing → not_assessed
 */
export function deriveReferralCandidateView(
  signals: ReferralCandidateSignals,
): ReferralCandidateView {
  const suggestedFromOpp: GrowthShareType[] = [];
  if (signals.openOpportunity) {
    const paths = [
      signals.openOpportunity.primaryGrowthPath,
      ...signals.openOpportunity.secondaryPaths,
    ].filter(Boolean) as GrowthPath[];
    for (const path of paths) {
      const shareType = growthPathToShareType(path);
      if (shareType && !suggestedFromOpp.includes(shareType)) suggestedFromOpp.push(shareType);
    }
  }

  const base = {
    customerId: signals.customerId,
    customerName: signals.displayName,
    enrollmentId: signals.enrollmentId,
    opportunityId: signals.openOpportunity?.id ?? null,
    pendingShareId: signals.pendingConsentShare?.id ?? null,
    suggestedShareTypes:
      suggestedFromOpp.length > 0 ? suggestedFromOpp : (["coach_referral"] as GrowthShareType[]),
  };

  if (signals.needsCoachAttribution || signals.attributionCount > 0) {
    if (signals.needsCoachAttribution) {
      return {
        ...base,
        state: "has_referral",
        stateLabel: REFERRAL_UI_STATE_LABELS.has_referral,
        reason: "有朋友透過分享留下資料，等你接手",
        nextActionLabel: "去接手",
        canManualStart: true,
        startWarning: null,
        primaryCta: "handle_friend",
      };
    }
    return {
      ...base,
      state: "has_referral",
      stateLabel: REFERRAL_UI_STATE_LABELS.has_referral,
      reason: "已有朋友透過分享進入",
      nextActionLabel: "查看顧客",
      canManualStart: true,
      startWarning: null,
      primaryCta: "view_customer",
    };
  }

  if (signals.activeShare || signals.pendingConsentShare) {
    const pending = Boolean(signals.pendingConsentShare);
    return {
      ...base,
      state: "sharing_active",
      stateLabel: REFERRAL_UI_STATE_LABELS.sharing_active,
      reason: pending ? "已邀請，等待顧客確認分享" : "分享連結進行中",
      nextActionLabel: pending ? "請顧客確認" : "查看顧客",
      canManualStart: false,
      startWarning: null,
      primaryCta: pending ? "confirm_consent" : "view_customer",
    };
  }

  const rescue = hasRescueSignal(signals);
  if (rescue) {
    return {
      ...base,
      state: "pause_care_first",
      stateLabel: REFERRAL_UI_STATE_LABELS.pause_care_first,
      reason: "目前建議先處理顧客狀況，再談分享",
      nextActionLabel: signals.hasEnrollment ? "前往處理" : "查看顧客",
      canManualStart: true, // warning only — Coach may still start manually
      startWarning: "目前建議先處理顧客狀況",
      primaryCta: signals.hasEnrollment ? "open_coaching" : "view_customer",
    };
  }

  const opp = signals.openOpportunity;
  const intent = Boolean(signals.latestCheckin?.explicitReferralIntent);
  const willingness = signals.latestCheckin?.recommendationWillingness;
  const highWillingness = willingness != null && willingness >= 8;

  if (opp && opp.readiness === "strong") {
    if (intent || (opp.primaryGrowthPath === "coach_assisted_referral" && highWillingness)) {
      return {
        ...base,
        state: "best_timing",
        stateLabel: REFERRAL_UI_STATE_LABELS.best_timing,
        reason: intent
          ? "顧客主動表示願意推薦朋友"
          : "對服務滿意，也願意推薦朋友",
        nextActionLabel: "啟動分享",
        canManualStart: true,
        startWarning: null,
        primaryCta: "start_share",
      };
    }
    if (opp.primaryGrowthPath === "social_proof") {
      return {
        ...base,
        state: "outcome_share_ready",
        stateLabel: REFERRAL_UI_STATE_LABELS.outcome_share_ready,
        reason: "量測與體驗不錯，適合分享成果",
        nextActionLabel: "啟動分享",
        canManualStart: true,
        startWarning: null,
        primaryCta: "start_share",
      };
    }
    if (opp.primaryGrowthPath === "friend_benefit") {
      return {
        ...base,
        state: "ask_ready",
        stateLabel: REFERRAL_UI_STATE_LABELS.ask_ready,
        reason: "適合用朋友專屬體驗溫柔邀請",
        nextActionLabel: "啟動分享",
        canManualStart: true,
        startWarning: null,
        primaryCta: "start_share",
      };
    }
    return {
      ...base,
      state: "ask_ready",
      stateLabel: REFERRAL_UI_STATE_LABELS.ask_ready,
      reason: "現在適合詢問推薦",
      nextActionLabel: "啟動分享",
      canManualStart: true,
      startWarning: null,
      primaryCta: "start_share",
    };
  }

  if (opp && opp.readiness === "emerging") {
    return {
      ...base,
      state: "nurturing",
      stateLabel: REFERRAL_UI_STATE_LABELS.nurturing,
      reason: "還在培養中，可先持續陪跑",
      nextActionLabel: "查看顧客",
      canManualStart: true,
      startWarning: null,
      primaryCta: "view_customer",
    };
  }

  if (signals.latestCheckin) {
    return {
      ...base,
      state: "nurturing",
      stateLabel: REFERRAL_UI_STATE_LABELS.nurturing,
      reason: "已有體驗回饋，可持續培養信任",
      nextActionLabel: "啟動分享",
      canManualStart: true,
      startWarning: null,
      primaryCta: "start_share",
    };
  }

  if (signals.hasEnrollment) {
    return {
      ...base,
      state: "nurturing",
      stateLabel: REFERRAL_UI_STATE_LABELS.nurturing,
      reason: "陪跑進行中，尚無足夠分享判斷",
      nextActionLabel: "啟動分享",
      canManualStart: true,
      startWarning: null,
      primaryCta: "start_share",
    };
  }

  return {
    ...base,
    state: "not_assessed",
    stateLabel: REFERRAL_UI_STATE_LABELS.not_assessed,
    reason: "目前還沒有足夠的體驗回饋，仍可手動啟動",
    nextActionLabel: "啟動分享",
    canManualStart: true,
    startWarning: null,
    primaryCta: "start_share",
  };
}

export function formatReferralUiStateLabel(state: string | null | undefined): string {
  if (!state) return REFERRAL_UI_STATE_LABELS.not_assessed;
  return REFERRAL_UI_STATE_LABELS[state as ReferralUiState] ?? "狀態更新中";
}
