/** Baki Life domain types. Amounts are integer cents (TWD). */

export type LifeAccountType =
  | "bank"
  | "cash"
  | "e_payment"
  | "credit_card"
  | "goal_pocket";

export type LifeAccountStatus = "active" | "archived";
export type LifeCategoryKind = "income" | "expense";
export type LifeCategoryStatus = "active" | "archived";
export type LifeGoalStatus =
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type LifeTransactionKind =
  | "income"
  | "expense"
  | "transfer"
  | "credit_payment"
  | "credit_refund";

export type LifeAccount = {
  id: string;
  ownerMemberId: string;
  name: string;
  accountType: LifeAccountType;
  status: LifeAccountStatus;
  currencyCode: "TWD";
  balanceCents: number;
  parentAccountId: string | null;
  linkedGoalId: string | null;
  defaultPaymentAccountId: string | null;
  icon: string | null;
  sortOrder: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LifeCategory = {
  id: string;
  ownerMemberId: string;
  kind: LifeCategoryKind;
  name: string;
  icon: string | null;
  status: LifeCategoryStatus;
  sortOrder: number;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LifeGoal = {
  id: string;
  ownerMemberId: string;
  title: string;
  description: string | null;
  icon: string | null;
  targetAmountCents: number | null;
  preparedAmountCents: number;
  targetDate: string | null;
  status: LifeGoalStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LifeTransaction = {
  id: string;
  ownerMemberId: string;
  kind: LifeTransactionKind;
  amountCents: number;
  currencyCode: "TWD";
  occurredAt: string;
  categoryId: string | null;
  accountId: string | null;
  counterpartyAccountId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LifeSnapshot = {
  id: string;
  ownerMemberId: string;
  capturedAt: string;
  note: string | null;
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  netWorthCents: number;
  previousSnapshotId: string | null;
  periodIncomeCents: number;
  periodExpenseCents: number;
  theoreticalNetCents: number | null;
  unrecordedExpenseCents: number;
  createdAt: string;
};

export type LifeSnapshotBalance = {
  id: string;
  snapshotId: string;
  accountId: string;
  balanceCents: number;
};

export type LifePreferences = {
  ownerMemberId: string;
  seededAt: string | null;
  lastExpenseAccountId: string | null;
  lastIncomeAccountId: string | null;
  updatedAt: string;
};

export const LIFE_ASSET_ACCOUNT_TYPES: LifeAccountType[] = [
  "bank",
  "cash",
  "e_payment",
  "goal_pocket",
];

export const LIFE_LIABILITY_ACCOUNT_TYPES: LifeAccountType[] = ["credit_card"];

export const DEFAULT_LIFE_SEED_ACCOUNTS: Array<{
  name: string;
  accountType: LifeAccountType;
  sortOrder: number;
}> = [
  { name: "中國信託", accountType: "bank", sortOrder: 10 },
  { name: "玉山銀行", accountType: "bank", sortOrder: 20 },
  { name: "將來銀行", accountType: "bank", sortOrder: 30 },
  { name: "現金", accountType: "cash", sortOrder: 40 },
  { name: "街口", accountType: "e_payment", sortOrder: 50 },
  { name: "全支付", accountType: "e_payment", sortOrder: 60 },
  { name: "LINE Pay", accountType: "e_payment", sortOrder: 70 },
];

export const DEFAULT_LIFE_SEED_CATEGORIES: Array<{
  kind: LifeCategoryKind;
  name: string;
  icon: string;
  sortOrder: number;
}> = [
  { kind: "expense", name: "餐飲", icon: "utensils", sortOrder: 10 },
  { kind: "expense", name: "交通", icon: "car", sortOrder: 20 },
  { kind: "expense", name: "生活", icon: "home", sortOrder: 30 },
  { kind: "expense", name: "廣告", icon: "megaphone", sortOrder: 40 },
  { kind: "expense", name: "購物", icon: "bag", sortOrder: 50 },
  { kind: "expense", name: "健康", icon: "heart", sortOrder: 60 },
  { kind: "expense", name: "娛樂", icon: "sparkles", sortOrder: 70 },
  { kind: "expense", name: "其他支出", icon: "dots", sortOrder: 90 },
  { kind: "income", name: "薪資", icon: "briefcase", sortOrder: 10 },
  { kind: "income", name: "獎金", icon: "gift", sortOrder: 20 },
  { kind: "income", name: "事業", icon: "trending", sortOrder: 30 },
  { kind: "income", name: "其他收入", icon: "plus", sortOrder: 90 },
];
