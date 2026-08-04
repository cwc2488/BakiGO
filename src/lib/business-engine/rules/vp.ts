/**
 * VP Rules — Baki GO 核心貨幣制度
 *
 * Source of truth: docs/VP_RULES.md
 * All VP amounts, targets, and bucket logic live here.
 */

import { RETAIL_TRANSACTION_TYPE_KEYS } from "./keys";
import type { VpBucketKey, VpTargetRule, VPBucket, VPSource } from "@/types/vp";

export const VP_BUCKET_KEYS = {
  PERSONAL: "personal",
  RETAIL_HOUSE: "retail_house",
  ORGANIZATION: "organization",
  MONTHLY: "monthly",
  ROLLING: "rolling",
  QUALIFICATION: "qualification",
  LIFETIME: "lifetime",
} as const satisfies Record<string, VpBucketKey>;

export const VP_TARGET_KEYS = {
  QUALIFICATION_WORLD_TEAM_PERSONAL: "qualification_world_team_personal_vp",
  QUALIFICATION_WORLD_TEAM_ORGANIZATION: "qualification_world_team_organization_vp",
} as const;

export interface VpRulesConfig {
  buckets: Record<VpBucketKey, VPBucket>;
  sources: VPSource[];
  targets: Record<string, VpTargetRule>;
  /** Rolling window in months — null until defined. */
  rollingWindowMonths: number | null;
  /** Transaction type keys that produce VP. */
  transactionTypeKeys: string[];
}

export const DEFAULT_VP_RULES: VpRulesConfig = {
  buckets: {
    personal: {
      bucketKey: "personal",
      label: "Personal VP",
      description: "個人 VP — 來自本人零售交易。",
    },
    retail_house: {
      bucketKey: "retail_house",
      label: "Retail House VP",
      description: "零售屋 VP — 依 retailHouseId 歸戶。",
    },
    organization: {
      bucketKey: "organization",
      label: "Organization VP",
      description: "組織 VP — 本人 + 下線組織 VP 合計。",
    },
    monthly: {
      bucketKey: "monthly",
      label: "Monthly VP",
      description: "月 VP — 當月個人 VP，供 Challenge 使用。",
    },
    rolling: {
      bucketKey: "rolling",
      label: "Rolling VP",
      description: "滾動 VP — 滾動視窗內 VP 合計。",
    },
    qualification: {
      bucketKey: "qualification",
      label: "Qualification VP",
      description: "晉升計算 VP — 供 Qualification / Promotion / Boss 使用。",
    },
    lifetime: {
      bucketKey: "lifetime",
      label: "Lifetime VP",
      description: "累積 VP — 全部有效交易 VP 合計。",
    },
  },
  sources: [
    {
      sourceKey: "retail_new_member_vp",
      transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
      bucket: "personal",
      label: "新會員 VP",
      multiplier: 1,
    },
    {
      sourceKey: "retail_returning_member_vp",
      transactionTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
      bucket: "personal",
      label: "舊會員 VP",
      multiplier: 1,
    },
  ],
  targets: {
    [VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_PERSONAL]: {
      targetKey: VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_PERSONAL,
      bucket: "qualification",
      label: "世界組資格 — 個人 VP",
      amount: 2500,
      unit: "VP",
    },
    [VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_ORGANIZATION]: {
      targetKey: VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_ORGANIZATION,
      bucket: "organization",
      label: "世界組資格 — 組織 VP",
      amount: 10000,
      unit: "VP",
    },
  },
  rollingWindowMonths: null,
  transactionTypeKeys: [
    RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
  ],
};

export function resolveVpTargetAmount(
  targetKey: string,
  rules: VpRulesConfig = DEFAULT_VP_RULES,
): number | null {
  const target = rules.targets[targetKey];
  if (!target) {
    return null;
  }
  const amount = target.amount;
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return null;
  }
  return amount;
}

export function getVpSourceForTransactionType(
  transactionTypeKey: string,
  rules: VpRulesConfig = DEFAULT_VP_RULES,
): VPSource | null {
  return rules.sources.find((source) => source.transactionTypeKey === transactionTypeKey) ?? null;
}
