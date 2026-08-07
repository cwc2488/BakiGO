import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { isInYearMonth } from "@/lib/business-engine/utils";
import type { VpResult } from "@/lib/business-engine/types";
import type { RetailTransaction } from "@/types/retail-transaction";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";
import type { YearMonth } from "@/types";
import type { CareerBlueprintView, MemberGoalActionStep, MemberGoalType } from "@/types/member-goal";

const NEW_CUSTOMER_STAGES = [
  "stranger",
  "measurement",
  "consultation",
  "new_customer",
  "returning_customer",
] as const;
const EXISTING_MEMBER_STAGES = ["new_member", "returning_member", "map", "supervisor", "world_team"] as const;
const NEAR_CLOSE_NEW_STAGES = ["consultation", "new_customer", "returning_customer"] as const;

interface PipelineComposition {
  newCustomerPool: number;
  existingMemberPool: number;
  nearCloseNew: number;
  earlyNew: number;
  returningCustomerCount: number;
  returningMemberCount: number;
  memberNames: string[];
  nearCloseNames: string[];
}

function averageTransactionAmount(
  transactions: RetailTransaction[],
  transactionTypeKey: string,
  yearMonth: YearMonth,
): number | null {
  const matched = transactions.filter(
    (transaction) =>
      isInYearMonth(transaction.transactionDate, yearMonth) &&
      transaction.transactionTypeKey === transactionTypeKey,
  );
  if (matched.length === 0) {
    return null;
  }
  const total = matched.reduce((sum, transaction) => sum + transaction.amount, 0);
  return total / matched.length;
}

function countPipelineStages(snapshot: RetailPipelineSnapshot | null, stageKeys: readonly string[]): number {
  if (!snapshot) {
    return 0;
  }
  return stageKeys.reduce(
    (sum, stageKey) =>
      sum + (snapshot.columns.find((column) => column.stageKey === stageKey)?.count ?? 0),
    0,
  );
}

function collectPipelineLeadNames(
  snapshot: RetailPipelineSnapshot | null,
  stageKeys: readonly string[],
  limit = 3,
): string[] {
  if (!snapshot) {
    return [];
  }
  return snapshot.columns
    .filter((column) => stageKeys.includes(column.stageKey))
    .flatMap((column) => column.leads.map((lead) => lead.displayName))
    .slice(0, limit);
}

function analyzePipeline(snapshot: RetailPipelineSnapshot | null): PipelineComposition {
  return {
    newCustomerPool: countPipelineStages(snapshot, NEW_CUSTOMER_STAGES),
    existingMemberPool: countPipelineStages(snapshot, EXISTING_MEMBER_STAGES),
    nearCloseNew: countPipelineStages(snapshot, NEAR_CLOSE_NEW_STAGES),
    earlyNew: countPipelineStages(snapshot, ["stranger", "measurement"]),
    returningCustomerCount: countPipelineStages(snapshot, ["returning_customer"]),
    returningMemberCount: countPipelineStages(snapshot, ["returning_member"]),
    memberNames: collectPipelineLeadNames(snapshot, EXISTING_MEMBER_STAGES),
    nearCloseNames: collectPipelineLeadNames(snapshot, NEAR_CLOSE_NEW_STAGES),
  };
}

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

function isPipelineColdStart(composition: PipelineComposition): boolean {
  return composition.newCustomerPool === 0 && composition.existingMemberPool === 0;
}

function buildColdStartGoalContext(
  type: MemberGoalType,
  todayNeeded: number,
  remaining: number,
): string {
  const todayLabel = todayNeeded.toLocaleString("zh-Hant");
  const remainingLabel = remaining.toLocaleString("zh-Hant");

  switch (type) {
    case "monthly_vp":
      return `本月還差 ${remainingLabel} VP（日均約 ${todayLabel}），但名單空著無法成交，今天先建漏斗。`;
    case "monthly_income_ntd":
      return `本月還差 ${remainingLabel} 元（日均約 ${todayLabel}），需先累積可成交名單。`;
    case "monthly_new_customers":
      return `本月還差 ${remainingLabel} 位新客，今天先補 2 位名單進漏斗。`;
  }
}

/** 名單全空時：固定三步建名單計畫，不給無法執行的 VP/成交建議。 */
function buildColdStartPlaybook(
  type: MemberGoalType,
  todayNeeded: number,
  remaining: number,
): MemberGoalActionStep[] {
  const goalContext = buildColdStartGoalContext(type, todayNeeded, remaining);

  return [
    {
      label: "今天新增 2 位名單",
      detail: `名單流程還是空的，先建漏斗才有成交來源。${goalContext}`,
      href: "/retail-pipeline",
    },
    {
      label: "安排或記錄 1 次量測",
      detail: "量測 → 諮詢 → 成交。把漏斗最上游先跑起來，後續 AI 才能依名單給具體建議。",
      href: "/daily-action?action=measurement",
    },
    {
      label: "到名單流程確認今日進度",
      detail: "養成每天固定補名單的習慣；有名單後，系統會改為推進舊客、舊會員等可衝目标的建議。",
      href: "/retail-pipeline",
    },
  ];
}

function buildPipelineVpStrategy(
  steps: MemberGoalActionStep[],
  composition: PipelineComposition,
  todayNeeded: number,
  remaining: number,
  transactions: RetailTransaction[],
  yearMonth: YearMonth,
): void {
  const avgNewMember = averageTransactionAmount(
    transactions,
    RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    yearMonth,
  );
  const avgReturning = averageTransactionAmount(
    transactions,
    RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
    yearMonth,
  );

  const memberHeavy =
    composition.existingMemberPool > composition.newCustomerPool &&
    composition.existingMemberPool >= 2;
  const newCustomerScarce = composition.newCustomerPool <= 2;
  const hasNearClose = composition.nearCloseNew > 0;

  if (memberHeavy) {
    const deals =
      avgReturning && avgReturning > 0
        ? Math.max(1, Math.ceil(todayNeeded / avgReturning))
        : 1;
    pushUniqueStep(steps, {
      label: `名單有 ${composition.existingMemberPool} 位已會員，優先從舊會員回購補 VP`,
      detail:
        avgReturning && avgReturning > 0
          ? `今天約需 ${todayNeeded.toLocaleString("zh-Hant")} VP，約 ${deals} 筆舊會員回購（平均 ${Math.round(avgReturning)} VP/筆）${formatNameHint(composition.memberNames)}${
              composition.returningMemberCount > 0
                ? ` · ${composition.returningMemberCount} 位已在舊會員階段`
                : ""
            }`
          : `已會員名單較多，到名單流程挑選 MAP/舊會員階段客戶 follow-up${formatNameHint(composition.memberNames)}`,
      href: "/retail-pipeline",
    });

    if (composition.returningCustomerCount > 0) {
      pushUniqueStep(steps, {
        label: `另有 ${composition.returningCustomerCount} 位舊客可手動招募為新會員`,
        detail: "舊客不會自動變會員，需你主動推進「招募為新會員」。",
        href: "/retail-pipeline",
      });
    }
  }

  if (hasNearClose) {
    const deals =
      avgNewMember && avgNewMember > 0
        ? Math.max(1, Math.ceil(todayNeeded / avgNewMember))
        : 1;
    pushUniqueStep(steps, {
      label: `推進 ${composition.nearCloseNew} 位接近成交的新客（諮詢/成交階段）`,
      detail:
        avgNewMember && avgNewMember > 0
          ? `新會員平均約 ${Math.round(avgNewMember)} VP/筆，今天約需 ${deals} 筆${formatNameHint(composition.nearCloseNames)}`
          : `這些名單已在諮詢或成交階段，推進成為新會員即可貢獻 VP${formatNameHint(composition.nearCloseNames)}`,
      href: "/retail-pipeline",
    });
  }

  if (newCustomerScarce && remaining > todayNeeded) {
    pushUniqueStep(steps, {
      label: "新客名單偏少，今天先新增 1–2 位名單並安排量測",
      detail: `本月還差 ${remaining.toLocaleString("zh-Hant")} VP，只靠舊會員可能不夠，需持續補新客漏斗。`,
      href: "/retail-pipeline",
    });
  }

  if (!memberHeavy && composition.existingMemberPool > 0 && avgReturning) {
    pushUniqueStep(steps, {
      label: `也可從 ${composition.existingMemberPool} 位已會員中安排舊會員回購`,
      detail: `平均每筆舊會員約 ${Math.round(avgReturning)} VP，作為今日 VP 的補充來源${formatNameHint(composition.memberNames)}`,
      href: "/retail-pipeline",
    });
  }

  if (composition.earlyNew > 0) {
    pushUniqueStep(steps, {
      label: `替 ${Math.min(composition.earlyNew, 3)} 位量測中/新名單安排諮詢`,
      detail: "把漏斗上游推進，後續才會有新會員 VP 進帳。",
      href: "/retail-pipeline",
    });
  }
}

function buildPipelineIncomeStrategy(
  steps: MemberGoalActionStep[],
  composition: PipelineComposition,
  todayNeeded: number,
  remaining: number,
  transactions: RetailTransaction[],
  yearMonth: YearMonth,
): void {
  const avgNew = averageTransactionAmount(
    transactions,
    RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    yearMonth,
  );
  const avgReturning = averageTransactionAmount(
    transactions,
    RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    yearMonth,
  );

  const memberHeavy =
    composition.existingMemberPool > composition.newCustomerPool &&
    composition.existingMemberPool >= 2;

  if (memberHeavy && avgReturning) {
    const deals = Math.max(1, Math.ceil(todayNeeded / avgReturning));
    pushUniqueStep(steps, {
      label: `名單已會員居多，優先從舊客回購補 ${todayNeeded.toLocaleString("zh-Hant")} 元`,
      detail: `約 ${deals} 筆舊客成交（平均 ${Math.round(avgReturning).toLocaleString("zh-Hant")} 元/筆）${formatNameHint(composition.memberNames)}`,
      href: "/retail-pipeline",
    });
  }

  if (composition.nearCloseNew > 0 && avgNew) {
    pushUniqueStep(steps, {
      label: `推進 ${composition.nearCloseNew} 位新客完成 NTD 成交`,
      detail: `新客平均約 ${Math.round(avgNew).toLocaleString("zh-Hant")} 元/筆${formatNameHint(composition.nearCloseNames)}`,
      href: "/retail-pipeline",
    });
  }

  if (composition.newCustomerPool <= 2 && remaining > todayNeeded) {
    pushUniqueStep(steps, {
      label: "新客名單不足，今天先新增名單或安排量測",
      detail: "收入目標需要新客與舊客並進，避免月底才找名單。",
      href: "/retail-pipeline",
    });
  }
}

function buildPipelineNewCustomerStrategy(
  steps: MemberGoalActionStep[],
  composition: PipelineComposition,
  todayNeeded: number,
): void {
  if (composition.nearCloseNew > 0) {
    pushUniqueStep(steps, {
      label: `從名單流程推進 ${Math.min(composition.nearCloseNew, todayNeeded)} 位新客成交`,
      detail: `已有 ${composition.nearCloseNew} 位在諮詢/成交階段，比從零找新客更快${formatNameHint(composition.nearCloseNames)}`,
      href: "/retail-pipeline",
    });
  }

  if (composition.earlyNew > 0) {
    pushUniqueStep(steps, {
      label: `安排 ${Math.min(composition.earlyNew, 3)} 位量測中名單進入諮詢`,
      detail: "把漏斗上游推進，本週才會有新客成交。",
      href: "/retail-pipeline",
    });
  }

  if (composition.newCustomerPool <= todayNeeded) {
    pushUniqueStep(steps, {
      label: "名單中新客不足，今天新增 1–2 位名單",
      detail: "新客目標需要持續補漏斗，避免每天從零開始。",
      href: "/retail-pipeline",
    });
  }
}

function buildVpFallbackSteps(
  steps: MemberGoalActionStep[],
  todayNeeded: number,
  transactions: RetailTransaction[],
  yearMonth: YearMonth,
): void {
  if (steps.length > 0) {
    return;
  }

  const avgNewMember = averageTransactionAmount(
    transactions,
    RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    yearMonth,
  );

  if (avgNewMember !== null && avgNewMember > 0) {
    pushUniqueStep(steps, {
      label: `到紀錄中心新增成交（新會員約 ${Math.round(avgNewMember)} VP/筆）`,
      detail: `今天約需 ${todayNeeded.toLocaleString("zh-Hant")} VP。`,
      href: "/events",
    });
  } else {
    pushUniqueStep(steps, {
      label: "到名單流程整理客戶，或紀錄中心登記第一筆 VP 成交",
      detail: `今天目標 ${todayNeeded.toLocaleString("zh-Hant")} VP，登記後系統會依你的客單與名單給更準建議。`,
      href: "/retail-pipeline",
    });
  }
}

export function buildMemberGoalPlaybook(input: {
  type: MemberGoalType;
  todayNeeded: number | null;
  remaining: number;
  yearMonth: YearMonth;
  vp: VpResult;
  transactions: RetailTransaction[];
  pipeline: RetailPipelineSnapshot | null;
}): MemberGoalActionStep[] {
  if (input.todayNeeded === null || input.todayNeeded <= 0) {
    return [];
  }

  const todayNeeded = input.todayNeeded;
  const composition = analyzePipeline(input.pipeline);

  if (isPipelineColdStart(composition)) {
    return buildColdStartPlaybook(input.type, todayNeeded, input.remaining);
  }

  const steps: MemberGoalActionStep[] = [];

  switch (input.type) {
    case "monthly_vp":
      buildPipelineVpStrategy(
        steps,
        composition,
        todayNeeded,
        input.remaining,
        input.transactions,
        input.yearMonth,
      );
      buildVpFallbackSteps(steps, todayNeeded, input.transactions, input.yearMonth);
      break;

    case "monthly_income_ntd":
      buildPipelineIncomeStrategy(
        steps,
        composition,
        todayNeeded,
        input.remaining,
        input.transactions,
        input.yearMonth,
      );
      if (steps.length === 0) {
        pushUniqueStep(steps, {
          label: "到名單流程或紀錄中心完成今日收入目標",
          detail: `今天約需 ${todayNeeded.toLocaleString("zh-Hant")} 元。`,
          href: "/retail-pipeline",
        });
      }
      break;

    case "monthly_new_customers":
      buildPipelineNewCustomerStrategy(steps, composition, todayNeeded);
      if (steps.length === 0) {
        pushUniqueStep(steps, {
          label: todayNeeded === 1 ? "今天促成 1 位新客成交" : `今天促成 ${todayNeeded} 位新客成交`,
          detail: "到名單流程新增或推進新客。",
          href: "/retail-pipeline",
        });
      }
      break;
  }

  return steps.slice(0, 5);
}

export function buildCareerGoalPlaybook(career: CareerBlueprintView): MemberGoalActionStep[] {
  const steps: MemberGoalActionStep[] = [];
  const rankName = career.nextRankName ?? "下一階";

  pushUniqueStep(steps, {
    label: "查看組織圖，找出最接近晉升的夥伴",
    detail: `再培養 ${career.remaining} 位下線即可晉升${rankName}。`,
    href: "/organization",
  });
  pushUniqueStep(steps, {
    label: "今日行動：記錄招募或輔導",
    detail: "招募新夥伴、協助現有下線晉升，都是組織目標的具體行動。",
    href: "/daily-action?action=recruit",
  });
  pushUniqueStep(steps, {
    label: "查看總裁之路進度",
    detail: "確認目前位階與下一個里程碑。",
    href: "/president-road",
  });

  return steps;
}

export function summarizePlaybook(steps: MemberGoalActionStep[]): string | null {
  if (steps.length === 0) {
    return null;
  }
  return steps[0].label;
}
