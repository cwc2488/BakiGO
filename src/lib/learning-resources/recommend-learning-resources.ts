import { getCareerRankIndex, isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import type { PromotionProgress } from "@/lib/business-engine/calculate-promotion-progress";
import type { QualificationResult } from "@/lib/business-engine/qualification/types";
import { ACTIVITY_KEYS, RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { resolveVpTargetAmount, VP_TARGET_KEYS } from "@/lib/business-engine/rules/vp";
import type { VpResult } from "@/lib/business-engine/types";
import {
  analyzePipeline,
  isPipelineColdStart,
} from "@/lib/member-goals/build-member-goal-playbook";
import type { RankGuidanceMode } from "@/lib/member-goals/build-rank-guidance-playbook";
import { LEARNING_RESOURCE_CATALOG } from "@/lib/learning-resources/catalog";
import type {
  LearningRecommendation,
  LearningResource,
  LearningStuckPointKey,
} from "@/types/learning-resource";
import { LEARNING_STUCK_POINT_LABELS } from "@/types/learning-resource";
import type { MonthlyChallengeProgress } from "@/types";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";

const STUCK_POINT_PRIORITY: LearningStuckPointKey[] = [
  "pipeline_empty",
  "foundation_newcomer",
  "map_qualification",
  "objection_handling",
  "pipeline_consultation",
  "retail_vp",
  "retail_house",
  "pipeline_early",
  "organization_growth",
  "president_path",
  "marketing_overview",
  "product_knowledge",
];

const STUCK_POINT_REASONS: Record<LearningStuckPointKey, string> = {
  pipeline_empty: "名單還是空的，先從新人規劃與制度概覽學起。",
  pipeline_early: "漏斗上游需要持續補名單與量測。",
  pipeline_consultation: "已在諮詢階段，可學異議處理與產品知識。",
  objection_handling: "成交前常卡在客戶異議，建議先看異議破解。",
  map_qualification: "正在衝 MAP / 督導資格，倫哥的 MAP 計畫最對症。",
  retail_vp: "個人 VP 是底盤核心，零售屋計畫可參考。",
  retail_house: "零售屋經營可參考士謙哥的實戰方法。",
  foundation_newcomer: "推廣組之前先把底盤學穩。",
  organization_growth: "推廣組之後重點是組織複製與雪球式成長。",
  president_path: "衝總裁路徑，可看 18 個月計畫與雪球計畫。",
  marketing_overview: "剛加入或需要重新理解事業制度時觀看。",
  product_knowledge: "諮詢與成交前，先把全產品熟悉。",
};

export function detectStuckPoints(input: {
  rankKey: string;
  rankGuidanceMode: RankGuidanceMode | null;
  pipeline: RetailPipelineSnapshot | null;
  qualificationResults: QualificationResult[];
  promotionProgress: PromotionProgress;
  vp: VpResult;
  monthlyChallenge: MonthlyChallengeProgress;
}): LearningStuckPointKey[] {
  const stuck: LearningStuckPointKey[] = [];
  const composition = analyzePipeline(input.pipeline);
  const isOrganization = isCareerRankAtOrAbove(input.rankKey, RANK_KEYS.PROMOTION_GROUP);

  if (isPipelineColdStart(composition)) {
    stuck.push("pipeline_empty", "foundation_newcomer", "marketing_overview");
  }

  if (!isOrganization && getCareerRankIndex(input.rankKey) <= getCareerRankIndex(RANK_KEYS.WORLD_TEAM)) {
    stuck.push("foundation_newcomer");
  }

  if (composition.earlyNew > 0) {
    stuck.push("pipeline_early");
  }

  if (composition.nearCloseNew > 0) {
    stuck.push("pipeline_consultation", "objection_handling", "product_knowledge");
  }

  const activeQualification = input.qualificationResults.find(
    (result) => !result.isQualified && !result.isRuleMissing,
  );
  if (
    activeQualification?.ruleKey === "qualification_supervisor" ||
    activeQualification?.ruleKey === "qualification_active_supervisor"
  ) {
    stuck.push("map_qualification");
  }

  if (composition.supervisorPathCount > 0 || composition.mapCount > 0) {
    stuck.push("map_qualification");
  }

  const mapTarget = resolveVpTargetAmount(VP_TARGET_KEYS.MAP_MONTHLY_PERSONAL);
  if (mapTarget !== null && input.vp.totalVp < mapTarget && !isOrganization) {
    stuck.push("retail_vp", "retail_house");
  }

  const consultation = input.monthlyChallenge.criteria.find(
    (item) => item.criterionKey === ACTIVITY_KEYS.CONSULTATION,
  );
  if (
    consultation &&
    consultation.targetValue !== null &&
    consultation.currentValue < consultation.targetValue
  ) {
    stuck.push("pipeline_consultation");
  }

  if (input.rankGuidanceMode === "organization" || isOrganization) {
    stuck.push("organization_growth", "president_path");
  }

  if (
    input.promotionProgress.progressSource === "downline" &&
    input.promotionProgress.remaining !== null &&
    input.promotionProgress.remaining > 0
  ) {
    stuck.push("organization_growth", "president_path");
  }

  return [...new Set(stuck)];
}

function sortStuckPoints(stuckPoints: LearningStuckPointKey[]): LearningStuckPointKey[] {
  return [...stuckPoints].sort(
    (left, right) => STUCK_POINT_PRIORITY.indexOf(left) - STUCK_POINT_PRIORITY.indexOf(right),
  );
}

function pickResourceForStuckPoint(
  stuckPoint: LearningStuckPointKey,
  usedIds: Set<string>,
): LearningResource | null {
  const candidates = LEARNING_RESOURCE_CATALOG.filter(
    (resource) => resource.stuckPoints.includes(stuckPoint) && !usedIds.has(resource.id),
  );
  return candidates[0] ?? null;
}

export function recommendLearningResources(input: {
  rankKey: string;
  rankGuidanceMode: RankGuidanceMode | null;
  pipeline: RetailPipelineSnapshot | null;
  qualificationResults: QualificationResult[];
  promotionProgress: PromotionProgress;
  vp: VpResult;
  monthlyChallenge: MonthlyChallengeProgress;
  limit?: number;
}): LearningRecommendation[] {
  const stuckPoints = sortStuckPoints(detectStuckPoints(input));
  const recommendations: LearningRecommendation[] = [];
  const usedIds = new Set<string>();
  const limit = input.limit ?? 2;

  for (const stuckPoint of stuckPoints) {
    if (recommendations.length >= limit) {
      break;
    }

    const resource = pickResourceForStuckPoint(stuckPoint, usedIds);
    if (!resource) {
      continue;
    }

    usedIds.add(resource.id);
    recommendations.push({
      resourceId: resource.id,
      title: resource.title,
      youtubeUrl: resource.youtubeUrl,
      stuckPointKey: stuckPoint,
      stuckPointLabel: LEARNING_STUCK_POINT_LABELS[stuckPoint],
      reason: STUCK_POINT_REASONS[stuckPoint],
      note: resource.note,
    });
  }

  return recommendations;
}
