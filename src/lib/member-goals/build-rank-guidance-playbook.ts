import {
  getCareerRankIndex,
  isCareerRankAtOrAbove,
  resolveCareerRankLabel,
} from "@/lib/auth/career-rank-order";
import type { PromotionProgress } from "@/lib/business-engine/calculate-promotion-progress";
import type { QualificationResult } from "@/lib/business-engine/qualification/types";
import { ACTIVITY_KEYS, RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { resolveVpTargetAmount, VP_TARGET_KEYS } from "@/lib/business-engine/rules/vp";
import type { VpResult } from "@/lib/business-engine/types";
import type { MonthlyChallengeProgress } from "@/types";
import type { MemberGoalActionStep } from "@/types/member-goal";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";
import { analyzePipeline, isPipelineColdStart } from "@/lib/member-goals/build-member-goal-playbook";

export type RankGuidanceMode = "foundation" | "organization";

export interface RankGuidanceView {
  mode: RankGuidanceMode;
  title: string;
  description: string;
  actionSteps: MemberGoalActionStep[];
}

function isOrganizationRank(rankKey: string): boolean {
  return isCareerRankAtOrAbove(rankKey, RANK_KEYS.PROMOTION_GROUP);
}

function pushUniqueStep(steps: MemberGoalActionStep[], step: MemberGoalActionStep): void {
  if (steps.some((existing) => existing.label === step.label)) {
    return;
  }
  steps.push(step);
}

function findActiveQualification(
  qualificationResults: QualificationResult[],
): QualificationResult | null {
  return (
    qualificationResults.find((result) => !result.isQualified && !result.isRuleMissing) ?? null
  );
}

function pushMonthlyActivitySteps(
  steps: MemberGoalActionStep[],
  monthlyChallenge: MonthlyChallengeProgress,
): void {
  for (const key of [ACTIVITY_KEYS.MEASUREMENT, ACTIVITY_KEYS.CONSULTATION] as const) {
    const criterion = monthlyChallenge.criteria.find((item) => item.criterionKey === key);
    if (!criterion || criterion.targetValue === null) {
      continue;
    }
    const remaining = Math.max(0, criterion.targetValue - criterion.currentValue);
    if (remaining <= 0) {
      continue;
    }

    const action = key === ACTIVITY_KEYS.MEASUREMENT ? "measurement" : "consultation";
    pushUniqueStep(steps, {
      label: `本月${criterion.label}還差 ${remaining} ${criterion.unit ?? "次"}`,
      detail: "底盤靠每日習慣累積；先完成今日量測或諮詢，名單漏斗才會有進展。",
      href: `/daily-action?action=${action}`,
    });
    break;
  }
}

function pushQualificationGapStep(
  steps: MemberGoalActionStep[],
  qualificationResults: QualificationResult[],
): void {
  const active = findActiveQualification(qualificationResults);
  if (!active || active.gaps.length === 0) {
    return;
  }

  const gap = active.gaps[0];
  const href =
    gap.metric === "vp" || gap.metric === "organization_vp"
      ? "/events"
      : gap.metric === "meeting_count"
        ? "/events"
        : gap.metric === "qualified_recruit_count"
          ? "/daily-action?action=recruit"
          : "/president-road";

  pushUniqueStep(steps, {
    label: `晉升${active.targetRankName}：${gap.label}`,
    detail: `目前 ${gap.current} / ${gap.target}，還差 ${gap.remaining} ${gap.unit}。推廣組之前先顧 MAP 資格與個人 VP。`,
    href,
  });
}

function pushFoundationPipelineSteps(
  steps: MemberGoalActionStep[],
  pipeline: RetailPipelineSnapshot | null,
): void {
  const composition = analyzePipeline(pipeline);

  if (isPipelineColdStart(composition)) {
    pushUniqueStep(steps, {
      label: "今天新增 2 位名單",
      detail: "名單還是空的，先建漏斗。推廣組之前最重要的是底盤，不是組織深度。",
      href: "/retail-pipeline",
    });
    pushUniqueStep(steps, {
      label: "安排或記錄 1 次量測",
      detail: "量測 → 諮詢 → 成交，把最上游跑起來。",
      href: "/daily-action?action=measurement",
    });
    return;
  }

  if (composition.accumulatedCustomerCount > 0) {
    pushUniqueStep(steps, {
      label: `從 ${composition.accumulatedCustomerCount} 位累積舊客中招募新會員`,
      detail: "舊客會長期累積；主動推進「招募為新會員」是 MAP 與 VP 的關鍵來源。",
      href: "/retail-pipeline",
    });
  }

  if (composition.earlyNew > 0) {
    pushUniqueStep(steps, {
      label: `替 ${Math.min(composition.earlyNew, 3)} 位量測中名單安排諮詢`,
      detail: "把漏斗上游推進，本週才會有新客與 VP 進帳。",
      href: "/retail-pipeline",
    });
  }

  if (composition.repurchaseMemberCount > 0) {
    pushUniqueStep(steps, {
      label: `安排 ${composition.repurchaseMemberCount} 位舊會員回購`,
      detail: "舊會員池同樣會累積；維持個人 VP 是晉升督導/世界組的基礎。",
      href: "/retail-pipeline",
    });
  }
}

function pushFoundationVpHint(steps: MemberGoalActionStep[], rankKey: string, vp: VpResult): void {
  const rankIndex = getCareerRankIndex(rankKey);
  const mapTarget = resolveVpTargetAmount(VP_TARGET_KEYS.MAP_MONTHLY_PERSONAL);
  const supervisorTarget = resolveVpTargetAmount(VP_TARGET_KEYS.SUPERVISOR_MONTHLY_PERSONAL);

  if (rankIndex <= getCareerRankIndex(RANK_KEYS.SUPERVISOR) && mapTarget !== null) {
    const remaining = Math.max(0, mapTarget - vp.totalVp);
    if (remaining > 0) {
      pushUniqueStep(steps, {
        label: `本月個人 VP 距 MAP 門檻還差 ${remaining}`,
        detail: `MAP 計劃需連續 3 個月達 ${mapTarget} VP；優先從名單成交補 VP。`,
        href: "/retail-pipeline",
      });
    }
    return;
  }

  if (supervisorTarget !== null) {
    const remaining = Math.max(0, supervisorTarget - vp.totalVp);
    if (remaining > 0) {
      pushUniqueStep(steps, {
        label: `本月個人 VP 距 ${supervisorTarget} 還差 ${remaining}`,
        detail: "活躍督導/世界組資格需要更高的月 VP；持續經營名單回購與新會員。",
        href: "/retail-pipeline",
      });
    }
  }
}

function buildFoundationGuidance(input: {
  rankKey: string;
  monthlyChallenge: MonthlyChallengeProgress;
  qualificationResults: QualificationResult[];
  vp: VpResult;
  pipeline: RetailPipelineSnapshot | null;
}): MemberGoalActionStep[] {
  const steps: MemberGoalActionStep[] = [];

  pushMonthlyActivitySteps(steps, input.monthlyChallenge);
  pushQualificationGapStep(steps, input.qualificationResults);
  pushFoundationPipelineSteps(steps, input.pipeline);
  pushFoundationVpHint(steps, input.rankKey, input.vp);

  pushUniqueStep(steps, {
    label: "查看總裁之路底盤進度",
    detail: "確認 MAP、督導、世界組各階段還差什麼。",
    href: "/president-road",
  });

  return steps.slice(0, 5);
}

function buildOrganizationGuidance(input: {
  promotionProgress: PromotionProgress;
  pipeline: RetailPipelineSnapshot | null;
}): MemberGoalActionStep[] {
  const steps: MemberGoalActionStep[] = [];
  const composition = analyzePipeline(input.pipeline);
  const progress = input.promotionProgress;

  if (
    progress.progressSource === "downline" &&
    progress.remaining !== null &&
    progress.remaining > 0 &&
    progress.nextRankName
  ) {
    pushUniqueStep(steps, {
      label: `再培養 ${progress.remaining} 位${progress.downlineRankName ?? "下線"}晉升${progress.nextRankName}`,
      detail: `${progress.description}。推廣組之後的主線是組織複製，不是每天從零找新客。`,
      href: "/organization",
    });
  }

  if (composition.supervisorPathCount > 0) {
    pushUniqueStep(steps, {
      label: `從名單培育 ${composition.supervisorPathCount} 位邁向督導`,
      detail: "舊會員 → MAP → 督導，是名單與組織目標的交會點。",
      href: "/retail-pipeline",
    });
  }

  if (composition.accumulatedCustomerCount > 0) {
    pushUniqueStep(steps, {
      label: `從累積的 ${composition.accumulatedCustomerCount} 位舊客招募新會員`,
      detail: "維持 VP 的同時，也在為組織線補人。",
      href: "/retail-pipeline",
    });
  }

  if (composition.repurchaseMemberCount > 0) {
    pushUniqueStep(steps, {
      label: `安排 ${composition.repurchaseMemberCount} 位舊會員回購`,
      detail: "推廣組以上仍要維持 VP；累積舊會員池是最穩的來源。",
      href: "/retail-pipeline",
    });
  }

  pushUniqueStep(steps, {
    label: "查看組織圖，鎖定最接近晉升的下線",
    detail: "今天的主線：推一條組織線，而不是只衝個人業績。",
    href: "/organization",
  });

  pushUniqueStep(steps, {
    label: "為下線發布或確認本月促銷",
    detail: "推廣組以上可透過促銷中心帶動全組織下線。",
    href: "/promotions",
  });

  return steps.slice(0, 5);
}

export function buildRankGuidance(input: {
  rankKey: string;
  monthlyChallenge: MonthlyChallengeProgress;
  qualificationResults: QualificationResult[];
  promotionProgress: PromotionProgress;
  vp: VpResult;
  pipeline: RetailPipelineSnapshot | null;
}): RankGuidanceView | null {
  const mode: RankGuidanceMode = isOrganizationRank(input.rankKey) ? "organization" : "foundation";
  const rankLabel = resolveCareerRankLabel(input.rankKey);
  const actionSteps =
    mode === "organization"
      ? buildOrganizationGuidance(input)
      : buildFoundationGuidance(input);

  if (actionSteps.length === 0) {
    return null;
  }

  const summary = actionSteps[0].label;
  const title = mode === "foundation" ? `底盤模式 · ${rankLabel}` : `組織模式 · ${rankLabel}`;
  const description =
    mode === "foundation"
      ? `推廣組之前先顧底盤（量測、名單、MAP 資格）· ${summary}`
      : `推廣組之後主線是組織複製，名單累積池維持 VP · ${summary}`;

  return {
    mode,
    title,
    description,
    actionSteps,
  };
}
