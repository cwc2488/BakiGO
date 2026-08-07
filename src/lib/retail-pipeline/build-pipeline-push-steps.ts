import {
  analyzePipeline,
  isPipelineColdStart,
} from "@/lib/member-goals/build-member-goal-playbook";
import type { MemberGoalActionStep } from "@/types/member-goal";
import type { LearningStuckPointKey } from "@/types/learning-resource";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";

const PIPELINE_STUCK_KEYS = new Set<LearningStuckPointKey>([
  "pipeline_empty",
  "pipeline_early",
  "pipeline_consultation",
]);

function pushUniqueStep(steps: MemberGoalActionStep[], step: MemberGoalActionStep): void {
  if (steps.some((existing) => existing.label === step.label)) {
    return;
  }
  steps.push(step);
}

function formatNameHint(names: string[]): string {
  if (names.length === 0) {
    return "";
  }
  return `（例如：${names.join("、")}）`;
}

/** 依名單流程現況產出「推進名單」行動建議，供 AI 與學習卡共用。 */
export function buildPipelinePushSteps(
  pipeline: RetailPipelineSnapshot | null,
): MemberGoalActionStep[] {
  const composition = analyzePipeline(pipeline);
  const steps: MemberGoalActionStep[] = [];

  if (isPipelineColdStart(composition)) {
    pushUniqueStep(steps, {
      label: "今天新增 2 位名單",
      detail: "名單還是空的，先建漏斗才有成交來源。",
      href: "/retail-pipeline",
    });
    pushUniqueStep(steps, {
      label: "安排或記錄 1 次量測",
      detail: "量測 → 諮詢 → 成交，把最上游跑起來。",
      href: "/daily-action?action=measurement",
    });
    return steps;
  }

  if (composition.nearCloseNew > 0) {
    pushUniqueStep(steps, {
      label: `推進 ${composition.nearCloseNew} 位接近成交的名單`,
      detail: `這些名單已在諮詢或成交階段，今天優先 follow-up${formatNameHint(composition.nearCloseNames)}`,
      href: "/retail-pipeline",
    });
  }

  if (composition.accumulatedCustomerCount > 0) {
    pushUniqueStep(steps, {
      label: `從 ${composition.accumulatedCustomerCount} 位累積舊客中招募新會員`,
      detail: `舊客池會長期累積；主動推進「招募為新會員」${formatNameHint(composition.accumulatedCustomerNames)}`,
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
      detail: `維持個人 VP 的穩定來源${formatNameHint(composition.repurchaseMemberNames)}`,
      href: "/retail-pipeline",
    });
  }

  if (composition.supervisorPathCount > 0) {
    pushUniqueStep(steps, {
      label: `名單中有 ${composition.supervisorPathCount} 位可推進 MAP/督導`,
      detail: `推進 MAP/督導可累積組織深度${formatNameHint(composition.supervisorPathNames)}`,
      href: "/retail-pipeline",
    });
  }

  return steps.slice(0, 4);
}

export function hasPipelineDifficulty(stuckPoints: LearningStuckPointKey[]): boolean {
  return stuckPoints.some((key) => PIPELINE_STUCK_KEYS.has(key));
}
