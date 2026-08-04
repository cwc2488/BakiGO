import type { EntityId, ISODateString, Timestamp, YearMonth } from "./common";

/** VP bucket identifiers — see docs/VP_RULES.md */
export type VpBucketKey =
  | "personal"
  | "retail_house"
  | "organization"
  | "monthly"
  | "rolling"
  | "qualification"
  | "lifetime";

export type VpTransactionStatus = "active" | "void";

/** Normalized VP record derived from a retail transaction — never manually created. */
export interface VPTransaction {
  transactionId: string;
  date: ISODateString;
  memberId: EntityId;
  retailHouseId: string | null;
  source: string;
  product: string | null;
  vp: number;
  month: string;
  year: string;
  rollingMonth: YearMonth;
  qualificationMonth: YearMonth;
  status: VpTransactionStatus;
}

/** Source mapping rule reference — configured in VP Rules. */
export interface VPSource {
  sourceKey: string;
  transactionTypeKey: string;
  bucket: VpBucketKey;
  label: string;
  /** VP multiplier; null until defined in VP Rules. */
  multiplier: number | null;
}

/** Bucket definition in VP Rules. */
export interface VPBucket {
  bucketKey: VpBucketKey;
  label: string;
  description: string;
}

/** Computed balance for one VP bucket — always derived, never stored as source of truth. */
export interface VPBalance {
  bucketKey: VpBucketKey;
  amount: number;
  /** Optional linked target from VP Rules. */
  targetKey: string | null;
  targetAmount: number | null;
  isRuleMissing: boolean;
}

/** Cached VP computation output — recomputable from transactions at any time. */
export interface VPSnapshot {
  memberId: EntityId;
  organizationId: EntityId;
  yearMonth: YearMonth;
  referenceDate: ISODateString;
  retailHouseId: string | null;
  buckets: Record<VpBucketKey, VPBalance>;
  transactionCount: number;
  /** Marks this as derived cache, not authoritative storage. */
  isCache: true;
  computedAt: Timestamp;
}

export interface VpTargetRule {
  targetKey: string;
  bucket: VpBucketKey;
  label: string;
  /** Null until defined in docs/VP_RULES.md — Priority 0. */
  amount: number | null;
  unit: string;
}
