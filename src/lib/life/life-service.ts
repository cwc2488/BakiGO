import {
  applyLedgerDelta,
  computeUnrecordedExpenseCents,
  isAssetAccountType,
  netExpenseCentsForStats,
  netIncomeCentsForStats,
  netWorthCents,
  sumAssetCents,
  sumLiabilityCents,
  taipeiMonthBounds,
  taipeiYearBounds,
  previousTaipeiMonthBounds,
  goalProgressPercent,
} from "@/lib/life/accounting";
import {
  mapAccount,
  mapCategory,
  mapGoal,
  mapPreferences,
  mapSnapshot,
  mapSnapshotBalance,
  mapTransaction,
} from "@/lib/life/mappers";
import { assertNonNegativeCents, assertPositiveCents } from "@/lib/life/money";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  DEFAULT_LIFE_SEED_ACCOUNTS,
  DEFAULT_LIFE_SEED_CATEGORIES,
  type LifeAccount,
  type LifeAccountStatus,
  type LifeAccountType,
  type LifeCategory,
  type LifeCategoryKind,
  type LifeCategoryStatus,
  type LifeGoal,
  type LifeGoalStatus,
  type LifeSnapshot,
  type LifeTransaction,
  type LifeTransactionKind,
} from "@/types/life";

export class LifeError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = "life_error",
  ) {
    super(message);
    this.name = "LifeError";
  }
}

function db() {
  return createSupabaseServiceClient();
}

function nowIso() {
  return new Date().toISOString();
}

async function loadAccountsMap(ownerMemberId: string) {
  const { data, error } = await db()
    .from("life_accounts")
    .select("*")
    .eq("owner_member_id", ownerMemberId);
  if (error) throw new LifeError(error.message, 500, "db_error");
  const map = new Map<string, { accountType: LifeAccountType; balanceCents: number; status: LifeAccountStatus }>();
  for (const row of data ?? []) {
    const a = mapAccount(row);
    map.set(a.id, {
      accountType: a.accountType,
      balanceCents: a.balanceCents,
      status: a.status,
    });
  }
  return map;
}

async function persistBalances(
  ownerMemberId: string,
  balances: Map<string, { balanceCents: number }>,
) {
  const updatedAt = nowIso();
  const entries = [...balances.entries()];
  if (entries.length === 0) return;
  const results = await Promise.all(
    entries.map(([id, row]) =>
      db()
        .from("life_accounts")
        .update({ balance_cents: row.balanceCents, updated_at: updatedAt })
        .eq("id", id)
        .eq("owner_member_id", ownerMemberId),
    ),
  );
  for (const { error } of results) {
    if (error) throw new LifeError(error.message, 500, "db_error");
  }
}

/** Asset accounts (incl. goal pockets) must not go negative after ledger ops. */
function assertNoNegativeAssetBalances(
  balances: Map<string, { accountType: LifeAccountType; balanceCents: number }>,
) {
  for (const [id, row] of balances) {
    if (!isAssetAccountType(row.accountType)) continue;
    if (row.balanceCents < 0) {
      throw new LifeError(
        "餘額不足，無法完成此操作（會造成帳戶負餘額）",
        400,
        "insufficient_balance",
      );
    }
  }
}

async function bumpCategoryUsage(ownerMemberId: string, categoryId: string) {
  const { data, error } = await db()
    .from("life_categories")
    .select("usage_count")
    .eq("id", categoryId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  if (error) throw new LifeError(error.message, 500, "db_error");
  if (!data) return;
  const { error: upErr } = await db()
    .from("life_categories")
    .update({
      usage_count: (data.usage_count ?? 0) + 1,
      last_used_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", categoryId)
    .eq("owner_member_id", ownerMemberId);
  if (upErr) throw new LifeError(upErr.message, 500, "db_error");
}

export async function ensureLifeSeeded(ownerMemberId: string): Promise<void> {
  const { data: prefs, error: prefsErr } = await db()
    .from("life_preferences")
    .select("*")
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  if (prefsErr) throw new LifeError(prefsErr.message, 500, "db_error");
  if (prefs?.seeded_at) return;

  const { count, error: countErr } = await db()
    .from("life_accounts")
    .select("id", { count: "exact", head: true })
    .eq("owner_member_id", ownerMemberId);
  if (countErr) throw new LifeError(countErr.message, 500, "db_error");

  if ((count ?? 0) === 0) {
    const accountRows = DEFAULT_LIFE_SEED_ACCOUNTS.map((a) => ({
      owner_member_id: ownerMemberId,
      name: a.name,
      account_type: a.accountType,
      sort_order: a.sortOrder,
      status: "active",
      balance_cents: 0,
    }));
    const { error } = await db().from("life_accounts").insert(accountRows);
    if (error) throw new LifeError(error.message, 500, "db_error");
  }

  const { count: catCount, error: catCountErr } = await db()
    .from("life_categories")
    .select("id", { count: "exact", head: true })
    .eq("owner_member_id", ownerMemberId);
  if (catCountErr) throw new LifeError(catCountErr.message, 500, "db_error");

  if ((catCount ?? 0) === 0) {
    const catRows = DEFAULT_LIFE_SEED_CATEGORIES.map((c) => ({
      owner_member_id: ownerMemberId,
      kind: c.kind,
      name: c.name,
      icon: c.icon,
      sort_order: c.sortOrder,
      status: "active",
    }));
    const { error } = await db().from("life_categories").insert(catRows);
    if (error) throw new LifeError(error.message, 500, "db_error");
  }

  const { error: upsertErr } = await db().from("life_preferences").upsert({
    owner_member_id: ownerMemberId,
    seeded_at: nowIso(),
    updated_at: nowIso(),
  });
  if (upsertErr) throw new LifeError(upsertErr.message, 500, "db_error");
}

// ---------- Accounts ----------

export async function listAccounts(
  ownerMemberId: string,
  opts?: { includeArchived?: boolean },
): Promise<LifeAccount[]> {
  await ensureLifeSeeded(ownerMemberId);
  let q = db().from("life_accounts").select("*").eq("owner_member_id", ownerMemberId);
  if (!opts?.includeArchived) q = q.eq("status", "active");
  const { data, error } = await q.order("sort_order").order("created_at");
  if (error) throw new LifeError(error.message, 500, "db_error");
  return (data ?? []).map(mapAccount);
}

export async function createAccount(
  ownerMemberId: string,
  input: {
    name: string;
    accountType: LifeAccountType;
    balanceCents?: number;
    parentAccountId?: string | null;
    linkedGoalId?: string | null;
    defaultPaymentAccountId?: string | null;
    icon?: string | null;
    sortOrder?: number;
    notes?: string | null;
  },
): Promise<LifeAccount> {
  await ensureLifeSeeded(ownerMemberId);
  const name = input.name.trim();
  if (!name) throw new LifeError("帳戶名稱不可為空");
  const balanceCents = assertNonNegativeCents(input.balanceCents ?? 0);

  if (input.accountType === "goal_pocket" && input.parentAccountId) {
    const parent = await getAccountOrThrow(ownerMemberId, input.parentAccountId);
    if (parent.accountType !== "bank") {
      throw new LifeError("目標口袋必須掛在銀行帳戶下");
    }
  }
  if (input.accountType === "credit_card" && input.defaultPaymentAccountId) {
    const pay = await getAccountOrThrow(ownerMemberId, input.defaultPaymentAccountId);
    if (!isAssetAccountType(pay.accountType) || pay.accountType === "goal_pocket") {
      throw new LifeError("預設繳款帳戶必須是銀行／現金／電子支付");
    }
  }

  const { data, error } = await db()
    .from("life_accounts")
    .insert({
      owner_member_id: ownerMemberId,
      name,
      account_type: input.accountType,
      balance_cents: balanceCents,
      parent_account_id: input.parentAccountId ?? null,
      linked_goal_id: input.linkedGoalId ?? null,
      default_payment_account_id: input.defaultPaymentAccountId ?? null,
      icon: input.icon ?? null,
      sort_order: input.sortOrder ?? 100,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw new LifeError(error.message, 500, "db_error");
  return mapAccount(data);
}

export async function updateAccount(
  ownerMemberId: string,
  accountId: string,
  patch: {
    name?: string;
    status?: LifeAccountStatus;
    parentAccountId?: string | null;
    linkedGoalId?: string | null;
    defaultPaymentAccountId?: string | null;
    icon?: string | null;
    sortOrder?: number;
    notes?: string | null;
    /** Manual pocket / balance set without ledger (rare; prefer transfer). */
    balanceCents?: number;
  },
): Promise<LifeAccount> {
  const existing = await getAccountOrThrow(ownerMemberId, accountId);
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name != null) {
    const name = patch.name.trim();
    if (!name) throw new LifeError("帳戶名稱不可為空");
    updates.name = name;
  }
  if (patch.status != null) {
    if (patch.status === "archived" && existing.status !== "archived") {
      const bal = existing.balanceCents;
      if (existing.accountType === "goal_pocket" && bal !== 0) {
        throw new LifeError(
          "請先將口袋餘額轉出至 0 元後才能刪除。",
          400,
          "pocket_not_empty",
        );
      }
      if (existing.accountType === "credit_card" && bal !== 0) {
        throw new LifeError(
          "請先繳清信用卡待繳餘額後才能封存。",
          400,
          "credit_not_cleared",
        );
      }
      if (isAssetAccountType(existing.accountType) && existing.accountType !== "goal_pocket" && bal !== 0) {
        throw new LifeError(
          "請先將帳戶餘額轉出至 0 元後才能封存。",
          400,
          "account_not_empty",
        );
      }
      // Soft-delete: unlink pocket from goal so goal remains.
      if (existing.accountType === "goal_pocket" && existing.linkedGoalId) {
        updates.linked_goal_id = null;
      }
    }
    updates.status = patch.status;
  }
  if (patch.parentAccountId !== undefined) updates.parent_account_id = patch.parentAccountId;
  if (patch.linkedGoalId !== undefined) updates.linked_goal_id = patch.linkedGoalId;
  if (patch.defaultPaymentAccountId !== undefined) {
    updates.default_payment_account_id = patch.defaultPaymentAccountId;
  }
  if (patch.icon !== undefined) updates.icon = patch.icon;
  if (patch.sortOrder != null) updates.sort_order = patch.sortOrder;
  if (patch.notes !== undefined) updates.notes = patch.notes;
  if (patch.balanceCents != null) {
    // Allowed for goal_pocket tracking sync and credit card liability correction
    if (
      existing.accountType !== "goal_pocket" &&
      existing.accountType !== "credit_card"
    ) {
      throw new LifeError("一般帳戶請用記帳或轉帳調整餘額", 400, "use_ledger");
    }
    updates.balance_cents = assertNonNegativeCents(patch.balanceCents);
  }

  const { data, error } = await db()
    .from("life_accounts")
    .update(updates)
    .eq("id", accountId)
    .eq("owner_member_id", ownerMemberId)
    .select("*")
    .single();
  if (error) throw new LifeError(error.message, 500, "db_error");
  const account = mapAccount(data);
  if (patch.balanceCents != null && account.linkedGoalId) {
    await syncGoalPreparedFromPocket(ownerMemberId, account.linkedGoalId);
  }
  return account;
}

async function getAccountOrThrow(ownerMemberId: string, accountId: string): Promise<LifeAccount> {
  const { data, error } = await db()
    .from("life_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  if (error) throw new LifeError(error.message, 500, "db_error");
  if (!data) throw new LifeError("帳戶不存在", 404, "not_found");
  return mapAccount(data);
}

async function syncGoalPreparedFromPocket(ownerMemberId: string, goalId: string) {
  const { data: pockets, error } = await db()
    .from("life_accounts")
    .select("balance_cents")
    .eq("owner_member_id", ownerMemberId)
    .eq("linked_goal_id", goalId)
    .eq("account_type", "goal_pocket")
    .eq("status", "active");
  if (error) throw new LifeError(error.message, 500, "db_error");
  const prepared = (pockets ?? []).reduce((s, p) => s + Number(p.balance_cents), 0);
  const { error: upErr } = await db()
    .from("life_goals")
    .update({ prepared_amount_cents: prepared, updated_at: nowIso() })
    .eq("id", goalId)
    .eq("owner_member_id", ownerMemberId);
  if (upErr) throw new LifeError(upErr.message, 500, "db_error");
}

// ---------- Categories ----------

export async function listCategories(
  ownerMemberId: string,
  opts?: { kind?: LifeCategoryKind; includeArchived?: boolean },
): Promise<LifeCategory[]> {
  await ensureLifeSeeded(ownerMemberId);
  let q = db().from("life_categories").select("*").eq("owner_member_id", ownerMemberId);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (!opts?.includeArchived) q = q.eq("status", "active");
  const { data, error } = await q
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("usage_count", { ascending: false })
    .order("sort_order");
  if (error) throw new LifeError(error.message, 500, "db_error");
  return (data ?? []).map(mapCategory);
}

export async function createCategory(
  ownerMemberId: string,
  input: { kind: LifeCategoryKind; name: string; icon?: string | null; sortOrder?: number },
): Promise<LifeCategory> {
  await ensureLifeSeeded(ownerMemberId);
  const name = input.name.trim();
  if (!name) throw new LifeError("分類名稱不可為空");
  const { data, error } = await db()
    .from("life_categories")
    .insert({
      owner_member_id: ownerMemberId,
      kind: input.kind,
      name,
      icon: input.icon ?? null,
      sort_order: input.sortOrder ?? 100,
    })
    .select("*")
    .single();
  if (error) throw new LifeError(error.message, 500, "db_error");
  return mapCategory(data);
}

export async function updateCategory(
  ownerMemberId: string,
  categoryId: string,
  patch: { name?: string; icon?: string | null; status?: LifeCategoryStatus; sortOrder?: number },
): Promise<LifeCategory> {
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.name != null) {
    const name = patch.name.trim();
    if (!name) throw new LifeError("分類名稱不可為空");
    updates.name = name;
  }
  if (patch.icon !== undefined) updates.icon = patch.icon;
  if (patch.status != null) updates.status = patch.status;
  if (patch.sortOrder != null) updates.sort_order = patch.sortOrder;
  const { data, error } = await db()
    .from("life_categories")
    .update(updates)
    .eq("id", categoryId)
    .eq("owner_member_id", ownerMemberId)
    .select("*")
    .single();
  if (error) throw new LifeError(error.message, 500, "db_error");
  return mapCategory(data);
}

// ---------- Goals ----------

export async function listGoals(
  ownerMemberId: string,
  opts?: { includeArchived?: boolean },
): Promise<LifeGoal[]> {
  await ensureLifeSeeded(ownerMemberId);
  let q = db().from("life_goals").select("*").eq("owner_member_id", ownerMemberId);
  if (!opts?.includeArchived) q = q.neq("status", "archived");
  const { data, error } = await q.order("sort_order").order("created_at");
  if (error) throw new LifeError(error.message, 500, "db_error");
  return (data ?? []).map(mapGoal);
}

export async function createGoal(
  ownerMemberId: string,
  input: {
    title: string;
    description?: string | null;
    icon?: string | null;
    targetAmountCents?: number | null;
    preparedAmountCents?: number;
    targetDate?: string | null;
    status?: LifeGoalStatus;
    sortOrder?: number;
  },
): Promise<LifeGoal> {
  await ensureLifeSeeded(ownerMemberId);
  const title = input.title.trim();
  if (!title) throw new LifeError("目標名稱不可為空");
  const target =
    input.targetAmountCents == null ? null : assertNonNegativeCents(input.targetAmountCents);
  const prepared = assertNonNegativeCents(input.preparedAmountCents ?? 0);
  const { data, error } = await db()
    .from("life_goals")
    .insert({
      owner_member_id: ownerMemberId,
      title,
      description: input.description ?? null,
      icon: input.icon ?? null,
      target_amount_cents: target,
      prepared_amount_cents: prepared,
      target_date: input.targetDate ?? null,
      status: input.status ?? "planning",
      sort_order: input.sortOrder ?? 100,
    })
    .select("*")
    .single();
  if (error) throw new LifeError(error.message, 500, "db_error");
  return mapGoal(data);
}

export async function updateGoal(
  ownerMemberId: string,
  goalId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    icon: string | null;
    targetAmountCents: number | null;
    preparedAmountCents: number;
    targetDate: string | null;
    status: LifeGoalStatus;
    sortOrder: number;
  }>,
): Promise<LifeGoal> {
  const updates: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.title != null) {
    const title = patch.title.trim();
    if (!title) throw new LifeError("目標名稱不可為空");
    updates.title = title;
  }
  if (patch.description !== undefined) updates.description = patch.description;
  if (patch.icon !== undefined) updates.icon = patch.icon;
  if (patch.targetAmountCents !== undefined) {
    updates.target_amount_cents =
      patch.targetAmountCents == null ? null : assertNonNegativeCents(patch.targetAmountCents);
  }
  if (patch.preparedAmountCents != null) {
    updates.prepared_amount_cents = assertNonNegativeCents(patch.preparedAmountCents);
  }
  if (patch.targetDate !== undefined) updates.target_date = patch.targetDate;
  if (patch.status != null) updates.status = patch.status;
  if (patch.sortOrder != null) updates.sort_order = patch.sortOrder;

  const { data, error } = await db()
    .from("life_goals")
    .update(updates)
    .eq("id", goalId)
    .eq("owner_member_id", ownerMemberId)
    .select("*")
    .single();
  if (error) throw new LifeError(error.message, 500, "db_error");
  return mapGoal(data);
}

// ---------- Transactions ----------

export async function listTransactions(
  ownerMemberId: string,
  opts?: {
    kind?: LifeTransactionKind;
    from?: string;
    to?: string;
    limit?: number;
  },
): Promise<LifeTransaction[]> {
  await ensureLifeSeeded(ownerMemberId);
  let q = db().from("life_transactions").select("*").eq("owner_member_id", ownerMemberId);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  if (opts?.from) q = q.gte("occurred_at", opts.from);
  if (opts?.to) q = q.lt("occurred_at", opts.to);
  const { data, error } = await q
    .order("occurred_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (error) throw new LifeError(error.message, 500, "db_error");
  return (data ?? []).map(mapTransaction);
}

async function validateCategory(
  ownerMemberId: string,
  categoryId: string,
  kind: LifeCategoryKind,
) {
  const { data, error } = await db()
    .from("life_categories")
    .select("*")
    .eq("id", categoryId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  if (error) throw new LifeError(error.message, 500, "db_error");
  if (!data) throw new LifeError("分類不存在", 404, "not_found");
  const cat = mapCategory(data);
  if (cat.kind !== kind) throw new LifeError("分類類型不符");
  if (cat.status !== "active") throw new LifeError("分類已封存");
  return cat;
}

export async function createTransaction(
  ownerMemberId: string,
  input: {
    kind: LifeTransactionKind;
    amountCents: number;
    occurredAt?: string;
    categoryId?: string | null;
    accountId: string;
    counterpartyAccountId?: string | null;
    note?: string | null;
  },
): Promise<LifeTransaction> {
  await ensureLifeSeeded(ownerMemberId);
  const amountCents = assertPositiveCents(input.amountCents);
  const occurredAt = input.occurredAt ?? nowIso();
  const accounts = await loadAccountsMap(ownerMemberId);

  if (input.kind === "income" || input.kind === "expense") {
    if (!input.categoryId) throw new LifeError("請選擇分類");
    await validateCategory(
      ownerMemberId,
      input.categoryId,
      input.kind === "income" ? "income" : "expense",
    );
  }

  const primary = accounts.get(input.accountId);
  if (!primary || primary.status === "archived") throw new LifeError("帳戶不可用");

  if (input.kind === "transfer") {
    if (!input.counterpartyAccountId) throw new LifeError("請選擇轉入帳戶");
    if (input.counterpartyAccountId === input.accountId) {
      throw new LifeError("轉出與轉入帳戶不可相同", 400, "same_account");
    }
    const to = accounts.get(input.counterpartyAccountId);
    if (!to || to.status === "archived") throw new LifeError("轉入帳戶不可用");
    if (!isAssetAccountType(primary.accountType) || !isAssetAccountType(to.accountType)) {
      throw new LifeError("轉帳僅限資產帳戶之間");
    }
    if (primary.balanceCents < amountCents) {
      throw new LifeError("轉出帳戶餘額不足", 400, "insufficient_balance");
    }
  }

  if (input.kind === "credit_payment") {
    if (!input.counterpartyAccountId) throw new LifeError("請選擇信用卡");
    if (!isAssetAccountType(primary.accountType) || primary.accountType === "goal_pocket") {
      throw new LifeError("繳款來源必須是銀行／現金／電子支付");
    }
    const cc = accounts.get(input.counterpartyAccountId);
    if (!cc || cc.accountType !== "credit_card") throw new LifeError("目標必須是信用卡");
  }

  if (input.kind === "expense" && primary.accountType === "credit_card") {
    // debit-style swipe on liability — OK
  } else if (input.kind === "expense" && !isAssetAccountType(primary.accountType)) {
    throw new LifeError("支出來源帳戶無效");
  }

  if (input.kind === "income" && !isAssetAccountType(primary.accountType)) {
    throw new LifeError("收入必須進入資產帳戶");
  }

  if (input.kind === "credit_refund") {
    if (primary.accountType !== "credit_card") throw new LifeError("退款帳戶必須是信用卡");
  }

  // Credit payment shouldn't exceed liability
  if (input.kind === "credit_payment" && input.counterpartyAccountId) {
    const before = accounts.get(input.counterpartyAccountId)!.balanceCents;
    if (amountCents > before) {
      throw new LifeError("繳款金額不可超過待繳餘額");
    }
  }

  const nextBalances = applyLedgerDelta(accounts, {
    kind: input.kind,
    amountCents,
    accountId: input.accountId,
    counterpartyAccountId: input.counterpartyAccountId ?? null,
    direction: 1,
  });
  assertNoNegativeAssetBalances(nextBalances);

  const { data, error } = await db()
    .from("life_transactions")
    .insert({
      owner_member_id: ownerMemberId,
      kind: input.kind,
      amount_cents: amountCents,
      occurred_at: occurredAt,
      category_id: input.categoryId ?? null,
      account_id: input.accountId,
      counterparty_account_id: input.counterpartyAccountId ?? null,
      note: input.note?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new LifeError(error.message, 500, "db_error");

  await persistBalances(ownerMemberId, nextBalances);

  // Non-blocking for UX: run side effects in parallel after balances are durable.
  const sideEffects: Promise<unknown>[] = [];
  if (input.categoryId) sideEffects.push(bumpCategoryUsage(ownerMemberId, input.categoryId));
  if (input.kind === "expense" || input.kind === "income") {
    const prefKey =
      input.kind === "expense" ? "last_expense_account_id" : "last_income_account_id";
    sideEffects.push(
      (async () => {
        const { error } = await db()
          .from("life_preferences")
          .upsert({
            owner_member_id: ownerMemberId,
            [prefKey]: input.accountId,
            updated_at: nowIso(),
          });
        if (error) throw new LifeError(error.message, 500, "db_error");
      })(),
    );
  }
  const touchedPocketIds = [input.accountId, input.counterpartyAccountId].filter(Boolean) as string[];
  for (const id of touchedPocketIds) {
    sideEffects.push(
      (async () => {
        const acct = await getAccountOrThrow(ownerMemberId, id);
        if (acct.accountType === "goal_pocket" && acct.linkedGoalId) {
          await syncGoalPreparedFromPocket(ownerMemberId, acct.linkedGoalId);
        }
      })(),
    );
  }
  if (sideEffects.length) await Promise.all(sideEffects);

  return mapTransaction(data);
}

export async function updateTransaction(
  ownerMemberId: string,
  transactionId: string,
  patch: {
    amountCents?: number;
    occurredAt?: string;
    categoryId?: string | null;
    accountId?: string;
    counterpartyAccountId?: string | null;
    note?: string | null;
  },
): Promise<LifeTransaction> {
  const { data: existingRow, error } = await db()
    .from("life_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  if (error) throw new LifeError(error.message, 500, "db_error");
  if (!existingRow) throw new LifeError("交易不存在", 404, "not_found");
  const existing = mapTransaction(existingRow);

  // Reverse old, apply new
  const accounts = await loadAccountsMap(ownerMemberId);
  let balances = applyLedgerDelta(accounts, {
    kind: existing.kind,
    amountCents: existing.amountCents,
    accountId: existing.accountId,
    counterpartyAccountId: existing.counterpartyAccountId,
    direction: -1,
  });

  const next = {
    kind: existing.kind,
    amountCents: patch.amountCents != null ? assertPositiveCents(patch.amountCents) : existing.amountCents,
    occurredAt: patch.occurredAt ?? existing.occurredAt,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
    accountId: patch.accountId ?? existing.accountId!,
    counterpartyAccountId:
      patch.counterpartyAccountId !== undefined
        ? patch.counterpartyAccountId
        : existing.counterpartyAccountId,
    note: patch.note !== undefined ? patch.note : existing.note,
  };

  if (existing.kind === "income" || existing.kind === "expense") {
    if (!next.categoryId) throw new LifeError("請選擇分類");
    await validateCategory(
      ownerMemberId,
      next.categoryId,
      existing.kind === "income" ? "income" : "expense",
    );
  }

  if (existing.kind === "transfer") {
    if (!next.counterpartyAccountId) throw new LifeError("請選擇轉入帳戶");
    if (next.counterpartyAccountId === next.accountId) {
      throw new LifeError("轉出與轉入帳戶不可相同", 400, "same_account");
    }
    const fromAcct = balances.get(next.accountId);
    const toAcct = balances.get(next.counterpartyAccountId);
    if (!fromAcct || !isAssetAccountType(fromAcct.accountType)) {
      throw new LifeError("轉出帳戶無效");
    }
    if (!toAcct || !isAssetAccountType(toAcct.accountType)) {
      throw new LifeError("轉入帳戶無效");
    }
  }

  balances = applyLedgerDelta(balances, {
    kind: next.kind,
    amountCents: next.amountCents,
    accountId: next.accountId,
    counterpartyAccountId: next.counterpartyAccountId,
    direction: 1,
  });

  const { data, error: upErr } = await db()
    .from("life_transactions")
    .update({
      amount_cents: next.amountCents,
      occurred_at: next.occurredAt,
      category_id: next.categoryId,
      account_id: next.accountId,
      counterparty_account_id: next.counterpartyAccountId,
      note: next.note?.trim() || null,
      updated_at: nowIso(),
    })
    .eq("id", transactionId)
    .eq("owner_member_id", ownerMemberId)
    .select("*")
    .single();
  if (upErr) throw new LifeError(upErr.message, 500, "db_error");

  assertNoNegativeAssetBalances(balances);
  await persistBalances(ownerMemberId, balances);

  const touched = [existing.accountId, existing.counterpartyAccountId, next.accountId, next.counterpartyAccountId].filter(Boolean) as string[];
  const goalIds = new Set<string>();
  for (const id of [...new Set(touched)]) {
    const acct = await getAccountOrThrow(ownerMemberId, id);
    if (acct.accountType === "goal_pocket" && acct.linkedGoalId) goalIds.add(acct.linkedGoalId);
  }
  for (const goalId of goalIds) {
    await syncGoalPreparedFromPocket(ownerMemberId, goalId);
  }

  return mapTransaction(data);
}

export async function deleteTransaction(
  ownerMemberId: string,
  transactionId: string,
): Promise<void> {
  const { data: existingRow, error } = await db()
    .from("life_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  if (error) throw new LifeError(error.message, 500, "db_error");
  if (!existingRow) throw new LifeError("交易不存在", 404, "not_found");
  const existing = mapTransaction(existingRow);

  const accounts = await loadAccountsMap(ownerMemberId);
  const balances = applyLedgerDelta(accounts, {
    kind: existing.kind,
    amountCents: existing.amountCents,
    accountId: existing.accountId,
    counterpartyAccountId: existing.counterpartyAccountId,
    direction: -1,
  });
  assertNoNegativeAssetBalances(balances);

  const { error: delErr } = await db()
    .from("life_transactions")
    .delete()
    .eq("id", transactionId)
    .eq("owner_member_id", ownerMemberId);
  if (delErr) throw new LifeError(delErr.message, 500, "db_error");
  await persistBalances(ownerMemberId, balances);

  const touched = [existing.accountId, existing.counterpartyAccountId].filter(Boolean) as string[];
  for (const id of touched) {
    const acct = await getAccountOrThrow(ownerMemberId, id);
    if (acct.accountType === "goal_pocket" && acct.linkedGoalId) {
      await syncGoalPreparedFromPocket(ownerMemberId, acct.linkedGoalId);
    }
  }
}

// ---------- Snapshots ----------

export async function listSnapshots(ownerMemberId: string, limit = 12): Promise<LifeSnapshot[]> {
  await ensureLifeSeeded(ownerMemberId);
  const { data, error } = await db()
    .from("life_snapshots")
    .select("*")
    .eq("owner_member_id", ownerMemberId)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw new LifeError(error.message, 500, "db_error");
  return (data ?? []).map(mapSnapshot);
}

export async function createSnapshot(
  ownerMemberId: string,
  input: {
    capturedAt?: string;
    note?: string | null;
    balances: Array<{ accountId: string; balanceCents: number }>;
  },
): Promise<{ snapshot: LifeSnapshot; balances: ReturnType<typeof mapSnapshotBalance>[] }> {
  await ensureLifeSeeded(ownerMemberId);
  const capturedAt = input.capturedAt ?? nowIso();
  const accounts = await listAccounts(ownerMemberId, { includeArchived: true });
  const active = accounts.filter((a) => a.status === "active");
  const balanceMap = new Map(input.balances.map((b) => [b.accountId, assertNonNegativeCents(b.balanceCents)]));

  for (const a of active) {
    if (!balanceMap.has(a.id)) {
      throw new LifeError(`缺少帳戶餘額：${a.name}`);
    }
  }

  const snapshotAccounts = active.map((a) => ({
    ...a,
    balanceCents: balanceMap.get(a.id)!,
  }));
  const totalAssets = sumAssetCents(snapshotAccounts);
  const totalLiab = sumLiabilityCents(snapshotAccounts);
  const net = totalAssets - totalLiab;

  const { data: prevRow } = await db()
    .from("life_snapshots")
    .select("*")
    .eq("owner_member_id", ownerMemberId)
    .lt("captured_at", capturedAt)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let periodIncome = 0;
  let periodExpense = 0;
  let theoretical: number | null = null;
  let unrecorded = 0;
  let previousId: string | null = null;

  if (prevRow) {
    const prev = mapSnapshot(prevRow);
    previousId = prev.id;
    const { data: txs, error: txErr } = await db()
      .from("life_transactions")
      .select("kind, amount_cents")
      .eq("owner_member_id", ownerMemberId)
      .gt("occurred_at", prev.capturedAt)
      .lte("occurred_at", capturedAt);
    if (txErr) throw new LifeError(txErr.message, 500, "db_error");
    const mapped = (txs ?? []).map((t) => ({
      kind: t.kind as LifeTransactionKind,
      amountCents: Number(t.amount_cents),
    }));
    periodIncome = netIncomeCentsForStats(mapped);
    periodExpense = netExpenseCentsForStats(mapped);
    const calc = computeUnrecordedExpenseCents({
      previousNetCents: prev.netWorthCents,
      periodIncomeCents: periodIncome,
      periodExpenseCents: periodExpense,
      actualNetCents: net,
    });
    theoretical = calc.theoreticalNetCents;
    unrecorded = calc.unrecordedExpenseCents;
  }

  const { data: snapRow, error: snapErr } = await db()
    .from("life_snapshots")
    .insert({
      owner_member_id: ownerMemberId,
      captured_at: capturedAt,
      note: input.note ?? null,
      total_assets_cents: totalAssets,
      total_liabilities_cents: totalLiab,
      net_worth_cents: net,
      previous_snapshot_id: previousId,
      period_income_cents: periodIncome,
      period_expense_cents: periodExpense,
      theoretical_net_cents: theoretical,
      unrecorded_expense_cents: unrecorded,
    })
    .select("*")
    .single();
  if (snapErr) throw new LifeError(snapErr.message, 500, "db_error");

  const balanceRows = active.map((a) => ({
    snapshot_id: snapRow.id,
    account_id: a.id,
    balance_cents: balanceMap.get(a.id)!,
  }));
  const { data: balData, error: balErr } = await db()
    .from("life_snapshot_balances")
    .insert(balanceRows)
    .select("*");
  if (balErr) throw new LifeError(balErr.message, 500, "db_error");

  // Align live balances to snapshot actuals
  for (const a of active) {
    const { error: upErr } = await db()
      .from("life_accounts")
      .update({ balance_cents: balanceMap.get(a.id)!, updated_at: nowIso() })
      .eq("id", a.id)
      .eq("owner_member_id", ownerMemberId);
    if (upErr) throw new LifeError(upErr.message, 500, "db_error");
    if (a.accountType === "goal_pocket" && a.linkedGoalId) {
      await syncGoalPreparedFromPocket(ownerMemberId, a.linkedGoalId);
    }
  }

  return {
    snapshot: mapSnapshot(snapRow),
    balances: (balData ?? []).map(mapSnapshotBalance),
  };
}

// ---------- Analytics / Dashboard ----------

export type LifePeriodKey = "this_month" | "last_month" | "this_year" | "custom";

function resolvePeriod(
  period: LifePeriodKey,
  from?: string,
  to?: string,
): { start: Date; end: Date } {
  if (period === "this_month") return taipeiMonthBounds();
  if (period === "last_month") return previousTaipeiMonthBounds();
  if (period === "this_year") return taipeiYearBounds();
  if (!from || !to) throw new LifeError("自訂期間需要起迄日期");
  return { start: new Date(from), end: new Date(to) };
}


export async function deleteSnapshot(ownerMemberId: string, snapshotId: string): Promise<void> {
  const { data: existing, error } = await db()
    .from("life_snapshots")
    .select("id")
    .eq("id", snapshotId)
    .eq("owner_member_id", ownerMemberId)
    .maybeSingle();
  if (error) throw new LifeError(error.message, 500, "db_error");
  if (!existing) throw new LifeError("快照不存在", 404, "not_found");

  // Clear forward links that point at this snapshot.
  const { error: unlinkErr } = await db()
    .from("life_snapshots")
    .update({ previous_snapshot_id: null })
    .eq("owner_member_id", ownerMemberId)
    .eq("previous_snapshot_id", snapshotId);
  if (unlinkErr) throw new LifeError(unlinkErr.message, 500, "db_error");

  const { error: balErr } = await db()
    .from("life_snapshot_balances")
    .delete()
    .eq("snapshot_id", snapshotId);
  if (balErr) throw new LifeError(balErr.message, 500, "db_error");

  const { error: delErr } = await db()
    .from("life_snapshots")
    .delete()
    .eq("id", snapshotId)
    .eq("owner_member_id", ownerMemberId);
  if (delErr) throw new LifeError(delErr.message, 500, "db_error");
}

export async function getAnalytics(
  ownerMemberId: string,
  opts: { period: LifePeriodKey; from?: string; to?: string },
) {
  await ensureLifeSeeded(ownerMemberId);
  const { start, end } = resolvePeriod(opts.period, opts.from, opts.to);
  const txs = await listTransactions(ownerMemberId, {
    from: start.toISOString(),
    to: end.toISOString(),
    limit: 5000,
  });
  const categories = await listCategories(ownerMemberId, { includeArchived: true });
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const incomeTx = txs.filter((t) => t.kind === "income");
  const expenseTx = txs.filter((t) => t.kind === "expense");
  const refundTotal = txs
    .filter((t) => t.kind === "credit_refund")
    .reduce((s, t) => s + t.amountCents, 0);

  const incomeTotal = incomeTx.reduce((s, t) => s + t.amountCents, 0);
  const expenseTotal = Math.max(
    0,
    expenseTx.reduce((s, t) => s + t.amountCents, 0) - refundTotal,
  );

  const byCategory = (list: LifeTransaction[]) => {
    const map = new Map<string, number>();
    for (const t of list) {
      if (!t.categoryId) continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents);
    }
    return [...map.entries()]
      .map(([categoryId, amountCents]) => ({
        categoryId,
        name: catMap.get(categoryId)?.name ?? "未知",
        icon: catMap.get(categoryId)?.icon ?? null,
        amountCents,
      }))
      .sort((a, b) => b.amountCents - a.amountCents);
  };

  const largestExpense = expenseTx.reduce<LifeTransaction | null>((best, t) => {
    if (!best || t.amountCents > best.amountCents) return t;
    return best;
  }, null);

  const largestIncome = incomeTx.reduce<LifeTransaction | null>((best, t) => {
    if (!best || t.amountCents > best.amountCents) return t;
    return best;
  }, null);

  const snapshots = await listSnapshots(ownerMemberId, 6);
  const latestSnap = snapshots[0] ?? null;
  const unrecorded = latestSnap?.unrecordedExpenseCents ?? 0;
  const recorded = expenseTotal;
  const unrecordedRatio =
    recorded + unrecorded > 0 ? unrecorded / (recorded + unrecorded) : 0;

  // Monthly trend for current year (Taipei)
  const year = taipeiYearBounds();
  const yearTx = await listTransactions(ownerMemberId, {
    from: year.start.toISOString(),
    to: year.end.toISOString(),
    limit: 10000,
  });
  const monthBuckets: Array<{ month: string; incomeCents: number; expenseCents: number }> = [];
  for (let m = 0; m < 12; m++) {
    const label = `${year.start.getUTCFullYear() + (year.start.getUTCMonth() > 0 ? 0 : 0)}-${String(m + 1).padStart(2, "0")}`;
    // Use Taipei month labels via fixed construction
    const y = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric" }).format(
      new Date(),
    );
    const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
    const mStart = new Date(`${monthKey}-01T00:00:00+08:00`);
    const nextM =
      m === 11
        ? new Date(`${Number(y) + 1}-01-01T00:00:00+08:00`)
        : new Date(`${y}-${String(m + 2).padStart(2, "0")}-01T00:00:00+08:00`);
    const inMonth = yearTx.filter((t) => {
      const d = new Date(t.occurredAt).getTime();
      return d >= mStart.getTime() && d < nextM.getTime();
    });
    monthBuckets.push({
      month: monthKey,
      incomeCents: netIncomeCentsForStats(inMonth),
      expenseCents: netExpenseCentsForStats(inMonth),
    });
    void label;
  }

  return {
    period: { start: start.toISOString(), end: end.toISOString(), key: opts.period },
    income: {
      totalCents: incomeTotal,
      byCategory: byCategory(incomeTx),
      largest: largestIncome,
    },
    expense: {
      totalCents: expenseTotal,
      byCategory: byCategory(expenseTx),
      largest: largestExpense,
      unrecordedExpenseCents: unrecorded,
      recordedVsUnrecorded: {
        recordedCents: recorded,
        unrecordedCents: unrecorded,
        unrecordedRatio,
      },
    },
    monthlyTrend: monthBuckets,
    latestSnapshot: latestSnap,
  };
}

export async function getDashboard(ownerMemberId: string) {
  await ensureLifeSeeded(ownerMemberId);
  const { start, end } = taipeiMonthBounds();
  const [accounts, goals, analytics, snapshots, prefsRow] = await Promise.all([
    listAccounts(ownerMemberId),
    listGoals(ownerMemberId),
    getAnalytics(ownerMemberId, { period: "this_month" }),
    listSnapshots(ownerMemberId, 1),
    db()
      .from("life_preferences")
      .select("*")
      .eq("owner_member_id", ownerMemberId)
      .maybeSingle(),
  ]);

  const monthLabel = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "long",
  }).format(new Date());

  const activeGoals = goals.filter((g) => g.status === "active" || g.status === "planning");
  const topGoal = activeGoals[0] ?? null;

  return {
    monthLabel,
    period: { start: start.toISOString(), end: end.toISOString() },
    incomeCents: analytics.income.totalCents,
    expenseCents: analytics.expense.totalCents,
    deltaCents: analytics.income.totalCents - analytics.expense.totalCents,
    topExpenseCategory: analytics.expense.byCategory[0] ?? null,
    netWorthCents: snapshots[0]?.netWorthCents ?? netWorthCents(accounts),
    latestSnapshot: snapshots[0] ?? null,
    topGoal: topGoal
      ? {
          ...topGoal,
          progressPercent: goalProgressPercent(
            topGoal.preparedAmountCents,
            topGoal.targetAmountCents,
          ),
        }
      : null,
    preferences: prefsRow.data ? mapPreferences(prefsRow.data) : null,
    assetTotalCents: sumAssetCents(accounts),
    liabilityTotalCents: sumLiabilityCents(accounts),
  };
}

export async function getQuickBootstrap(ownerMemberId: string) {
  await ensureLifeSeeded(ownerMemberId);
  const [expenseCategories, incomeCategories, accounts, prefsRow] = await Promise.all([
    listCategories(ownerMemberId, { kind: "expense" }),
    listCategories(ownerMemberId, { kind: "income" }),
    listAccounts(ownerMemberId),
    db()
      .from("life_preferences")
      .select("*")
      .eq("owner_member_id", ownerMemberId)
      .maybeSingle(),
  ]);
  const prefs = prefsRow.data ? mapPreferences(prefsRow.data) : null;
  const assetAccounts = accounts.filter(
    (a) => isAssetAccountType(a.accountType) || a.accountType === "credit_card",
  );
  return {
    /** @deprecated prefer expenseCategories — kept for older clients */
    categories: expenseCategories.slice(0, 12),
    expenseCategories: expenseCategories.slice(0, 12),
    incomeCategories: incomeCategories.slice(0, 12),
    accounts: assetAccounts,
    lastExpenseAccountId: prefs?.lastExpenseAccountId ?? null,
    lastIncomeAccountId: prefs?.lastIncomeAccountId ?? null,
  };
}

export { getAccountOrThrow };
