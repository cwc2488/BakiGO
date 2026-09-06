import type {
  LifeAccount,
  LifeAccountStatus,
  LifeAccountType,
  LifeCategory,
  LifeCategoryKind,
  LifeCategoryStatus,
  LifeGoal,
  LifeGoalStatus,
  LifePreferences,
  LifeSnapshot,
  LifeSnapshotBalance,
  LifeTransaction,
  LifeTransactionKind,
} from "@/types/life";

type DbAccount = {
  id: string;
  owner_member_id: string;
  name: string;
  account_type: LifeAccountType;
  status: LifeAccountStatus;
  currency_code: "TWD";
  balance_cents: number;
  parent_account_id: string | null;
  linked_goal_id: string | null;
  default_payment_account_id: string | null;
  icon: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type DbCategory = {
  id: string;
  owner_member_id: string;
  kind: LifeCategoryKind;
  name: string;
  icon: string | null;
  status: LifeCategoryStatus;
  sort_order: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbGoal = {
  id: string;
  owner_member_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  target_amount_cents: number | null;
  prepared_amount_cents: number;
  target_date: string | null;
  status: LifeGoalStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type DbTx = {
  id: string;
  owner_member_id: string;
  kind: LifeTransactionKind;
  amount_cents: number;
  currency_code: "TWD";
  occurred_at: string;
  category_id: string | null;
  account_id: string | null;
  counterparty_account_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type DbSnapshot = {
  id: string;
  owner_member_id: string;
  captured_at: string;
  note: string | null;
  total_assets_cents: number;
  total_liabilities_cents: number;
  net_worth_cents: number;
  previous_snapshot_id: string | null;
  period_income_cents: number;
  period_expense_cents: number;
  theoretical_net_cents: number | null;
  unrecorded_expense_cents: number;
  created_at: string;
};

type DbSnapshotBalance = {
  id: string;
  snapshot_id: string;
  account_id: string;
  balance_cents: number;
};

type DbPrefs = {
  owner_member_id: string;
  seeded_at: string | null;
  last_expense_account_id: string | null;
  last_income_account_id: string | null;
  updated_at: string;
};

export function mapAccount(row: DbAccount): LifeAccount {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    name: row.name,
    accountType: row.account_type,
    status: row.status,
    currencyCode: row.currency_code,
    balanceCents: Number(row.balance_cents),
    parentAccountId: row.parent_account_id,
    linkedGoalId: row.linked_goal_id,
    defaultPaymentAccountId: row.default_payment_account_id,
    icon: row.icon,
    sortOrder: row.sort_order,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCategory(row: DbCategory): LifeCategory {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    kind: row.kind,
    name: row.name,
    icon: row.icon,
    status: row.status,
    sortOrder: row.sort_order,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGoal(row: DbGoal): LifeGoal {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    targetAmountCents: row.target_amount_cents == null ? null : Number(row.target_amount_cents),
    preparedAmountCents: Number(row.prepared_amount_cents),
    targetDate: row.target_date,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTransaction(row: DbTx): LifeTransaction {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    kind: row.kind,
    amountCents: Number(row.amount_cents),
    currencyCode: row.currency_code,
    occurredAt: row.occurred_at,
    categoryId: row.category_id,
    accountId: row.account_id,
    counterpartyAccountId: row.counterparty_account_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSnapshot(row: DbSnapshot): LifeSnapshot {
  return {
    id: row.id,
    ownerMemberId: row.owner_member_id,
    capturedAt: row.captured_at,
    note: row.note,
    totalAssetsCents: Number(row.total_assets_cents),
    totalLiabilitiesCents: Number(row.total_liabilities_cents),
    netWorthCents: Number(row.net_worth_cents),
    previousSnapshotId: row.previous_snapshot_id,
    periodIncomeCents: Number(row.period_income_cents),
    periodExpenseCents: Number(row.period_expense_cents),
    theoreticalNetCents:
      row.theoretical_net_cents == null ? null : Number(row.theoretical_net_cents),
    unrecordedExpenseCents: Number(row.unrecorded_expense_cents),
    createdAt: row.created_at,
  };
}

export function mapSnapshotBalance(row: DbSnapshotBalance): LifeSnapshotBalance {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    accountId: row.account_id,
    balanceCents: Number(row.balance_cents),
  };
}

export function mapPreferences(row: DbPrefs): LifePreferences {
  return {
    ownerMemberId: row.owner_member_id,
    seededAt: row.seeded_at,
    lastExpenseAccountId: row.last_expense_account_id,
    lastIncomeAccountId: row.last_income_account_id,
    updatedAt: row.updated_at,
  };
}
