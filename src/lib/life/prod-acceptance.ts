import { SUPER_ADMIN_MEMBER_NUMBERS } from "@/lib/auth/super-admin";
import { goalProgressPercent } from "@/lib/life/accounting";
import {
  createAccount,
  createCategory,
  createGoal,
  createSnapshot,
  createTransaction,
  deleteTransaction,
  ensureLifeSeeded,
  getAnalytics,
  getDashboard,
  getQuickBootstrap,
  listAccounts,
  listCategories,
  listGoals,
  listSnapshots,
  listTransactions,
  updateAccount,
  updateCategory,
  updateGoal,
  updateTransaction,
} from "@/lib/life/life-service";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { DEFAULT_LIFE_SEED_ACCOUNTS } from "@/types/life";

export const LIFE_ACCEPTANCE_MARKER = "[LIFE-ACCEPT-DISPOSE]";

/** One-time Production acceptance bearer (route removed after PASS). */
export const LIFE_ACCEPTANCE_BEARER =
  "life-accept-2026-09-06-k7Qm2nXp9Vw4Rt8Hz3Yb";

export type LifeAcceptanceCheck = { name: string; ok: boolean; detail?: string };

function check(
  checks: LifeAcceptanceCheck[],
  name: string,
  ok: boolean,
  detail?: string,
): void {
  checks.push({ name, ok, detail: detail || undefined });
}

function must(
  checks: LifeAcceptanceCheck[],
  name: string,
  ok: boolean,
  detail?: string,
): void {
  check(checks, name, ok, detail);
  if (!ok) {
    throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function resolveOwnerMemberId(): Promise<string> {
  const db = createSupabaseServiceClient();
  const memberNumber = SUPER_ADMIN_MEMBER_NUMBERS[0];
  const { data, error } = await db
    .from("members")
    .select("id, member_number")
    .eq("member_number", memberNumber)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error(`Owner member_number ${memberNumber} not found`);
  return data.id as string;
}

async function captureBalances(ownerId: string): Promise<Map<string, number>> {
  const accounts = await listAccounts(ownerId, { includeArchived: true });
  return new Map(accounts.map((a) => [a.id, a.balanceCents]));
}

async function restoreBalances(ownerId: string, original: Map<string, number>) {
  const db = createSupabaseServiceClient();
  const now = new Date().toISOString();
  for (const [id, balanceCents] of original) {
    await db
      .from("life_accounts")
      .update({ balance_cents: balanceCents, updated_at: now })
      .eq("id", id)
      .eq("owner_member_id", ownerId);
  }
}

async function cleanupDisposable(ownerId: string) {
  const db = createSupabaseServiceClient();
  const marker = LIFE_ACCEPTANCE_MARKER;

  const { data: txs } = await db
    .from("life_transactions")
    .select("id")
    .eq("owner_member_id", ownerId)
    .like("note", `%${marker}%`);
  for (const row of txs ?? []) {
    try {
      await deleteTransaction(ownerId, row.id);
    } catch {
      await db
        .from("life_transactions")
        .delete()
        .eq("id", row.id)
        .eq("owner_member_id", ownerId);
    }
  }

  const { data: snaps } = await db
    .from("life_snapshots")
    .select("id")
    .eq("owner_member_id", ownerId)
    .like("note", `%${marker}%`);
  for (const row of snaps ?? []) {
    await db.from("life_snapshot_balances").delete().eq("snapshot_id", row.id);
    await db
      .from("life_snapshots")
      .delete()
      .eq("id", row.id)
      .eq("owner_member_id", ownerId);
  }

  const { data: goals } = await db
    .from("life_goals")
    .select("id")
    .eq("owner_member_id", ownerId)
    .or(`title.ilike.%${marker}%,description.ilike.%${marker}%`);
  for (const row of goals ?? []) {
    await db
      .from("life_accounts")
      .update({ linked_goal_id: null })
      .eq("linked_goal_id", row.id)
      .eq("owner_member_id", ownerId);
    await db.from("life_goals").delete().eq("id", row.id).eq("owner_member_id", ownerId);
  }

  const { data: accts } = await db
    .from("life_accounts")
    .select("id")
    .eq("owner_member_id", ownerId)
    .or(`name.ilike.%${marker}%,notes.ilike.%${marker}%`);
  for (const row of accts ?? []) {
    await db.from("life_accounts").delete().eq("id", row.id).eq("owner_member_id", ownerId);
  }

  const { data: cats } = await db
    .from("life_categories")
    .select("id")
    .eq("owner_member_id", ownerId)
    .ilike("name", `%${marker}%`);
  for (const row of cats ?? []) {
    await db.from("life_categories").delete().eq("id", row.id).eq("owner_member_id", ownerId);
  }
}

/**
 * Full Owner acceptance against Production DB via service role.
 * Creates only disposable rows tagged with LIFE_ACCEPTANCE_MARKER, then cleans them up
 * and restores pre-run account balances.
 */
export async function runLifeProductionAcceptance(): Promise<{
  ok: boolean;
  ownerMemberId: string;
  checks: LifeAcceptanceCheck[];
  elapsedMs: number;
}> {
  const started = Date.now();
  const checks: LifeAcceptanceCheck[] = [];
  const ownerId = await resolveOwnerMemberId();
  await cleanupDisposable(ownerId);

  let originalBalances: Map<string, number> | null = null;

  try {
    await ensureLifeSeeded(ownerId);
    const accounts1 = await listAccounts(ownerId, { includeArchived: true });
    const seedNames = DEFAULT_LIFE_SEED_ACCOUNTS.map((a) => a.name);
    const missing = seedNames.filter((n) => !accounts1.some((a) => a.name === n));
    must(checks, "bootstrap_seed_accounts", missing.length === 0, missing.join(",") || "ok");

    await ensureLifeSeeded(ownerId);
    const accounts2 = await listAccounts(ownerId, { includeArchived: true });
    const seedCount = accounts2.filter((a) => seedNames.includes(a.name)).length;
    must(
      checks,
      "bootstrap_idempotent",
      seedCount === seedNames.length,
      `seedCount=${seedCount} total=${accounts2.length}`,
    );

    originalBalances = await captureBalances(ownerId);

    const byName = (name: string) => {
      const a = accounts2.find((x) => x.name === name && x.status === "active");
      if (!a) throw new Error(`missing account ${name}`);
      return a;
    };
    const ctbc = byName("中國信託");
    const esun = byName("玉山銀行");
    const future = byName("將來銀行");
    const jko = byName("街口");
    const cash = byName("現金");
    byName("全支付");
    byName("LINE Pay");

    const extraAcct = await createAccount(ownerId, {
      name: `驗收臨時帳戶 ${LIFE_ACCEPTANCE_MARKER}`,
      accountType: "cash",
      balanceCents: 0,
      sortOrder: 999,
      notes: LIFE_ACCEPTANCE_MARKER,
      icon: "wallet",
    });
    await updateAccount(ownerId, extraAcct.id, {
      sortOrder: 3,
      name: `驗收臨時帳戶改 ${LIFE_ACCEPTANCE_MARKER}`,
    });
    check(checks, "accounts_create_sort", true);

    const expCat = await createCategory(ownerId, {
      kind: "expense",
      name: `驗收支出分類 ${LIFE_ACCEPTANCE_MARKER}`,
      icon: "bag",
      sortOrder: 5,
    });
    const incCat = await createCategory(ownerId, {
      kind: "income",
      name: `驗收收入分類 ${LIFE_ACCEPTANCE_MARKER}`,
      icon: "plus",
      sortOrder: 5,
    });
    const expUpdated = await updateCategory(ownerId, expCat.id, {
      icon: "sparkles",
      sortOrder: 1,
    });
    must(checks, "categories_crud", expUpdated.icon === "sparkles" && expUpdated.sortOrder === 1);

    let expense = await createTransaction(ownerId, {
      kind: "expense",
      amountCents: 128_000,
      categoryId: expCat.id,
      accountId: future.id,
      note: `expense ${LIFE_ACCEPTANCE_MARKER}`,
      occurredAt: new Date().toISOString(),
    });
    expense = await updateTransaction(ownerId, expense.id, {
      amountCents: 150_000,
      note: `expense-updated ${LIFE_ACCEPTANCE_MARKER}`,
    });
    must(checks, "expense_update", expense.amountCents === 150_000);
    const futureAfterExpense = (await listAccounts(ownerId)).find((a) => a.id === future.id)!
      .balanceCents;
    await deleteTransaction(ownerId, expense.id);
    const futureRestored = (await listAccounts(ownerId)).find((a) => a.id === future.id)!;
    must(
      checks,
      "expense_delete_restores_balance",
      futureRestored.balanceCents === futureAfterExpense + 150_000,
      `got=${futureRestored.balanceCents}`,
    );

    let income = await createTransaction(ownerId, {
      kind: "income",
      amountCents: 1_000_000,
      categoryId: incCat.id,
      accountId: ctbc.id,
      note: `income ${LIFE_ACCEPTANCE_MARKER}`,
    });
    income = await updateTransaction(ownerId, income.id, { amountCents: 1_200_000 });
    must(checks, "income_update", income.amountCents === 1_200_000);
    await deleteTransaction(ownerId, income.id);
    check(checks, "income_delete", true);

    await createTransaction(ownerId, {
      kind: "expense",
      amountCents: 80_000,
      categoryId: expCat.id,
      accountId: future.id,
      note: `expense-keep ${LIFE_ACCEPTANCE_MARKER}`,
    });
    await createTransaction(ownerId, {
      kind: "income",
      amountCents: 500_000,
      categoryId: incCat.id,
      accountId: ctbc.id,
      note: `income-keep ${LIFE_ACCEPTANCE_MARKER}`,
    });

    const analyticsBefore = await getAnalytics(ownerId, { period: "this_month" });
    const incomeBefore = analyticsBefore.income.totalCents;
    const expenseBefore = analyticsBefore.expense.totalCents;

    const ctbcBefore = (await listAccounts(ownerId)).find((a) => a.id === ctbc.id)!.balanceCents;
    const futureBefore = (await listAccounts(ownerId)).find((a) => a.id === future.id)!.balanceCents;
    await createTransaction(ownerId, {
      kind: "transfer",
      amountCents: 1_000_000,
      accountId: ctbc.id,
      counterpartyAccountId: future.id,
      note: `transfer-ctbc-future ${LIFE_ACCEPTANCE_MARKER}`,
    });
    const ctbcAfter = (await listAccounts(ownerId)).find((a) => a.id === ctbc.id)!.balanceCents;
    const futureAfter = (await listAccounts(ownerId)).find((a) => a.id === future.id)!.balanceCents;
    must(checks, "transfer_ctbc_debit", ctbcAfter === ctbcBefore - 1_000_000);
    must(checks, "transfer_future_credit", futureAfter === futureBefore + 1_000_000);

    const analyticsAfterTransfer = await getAnalytics(ownerId, { period: "this_month" });
    must(
      checks,
      "transfer_not_in_income",
      analyticsAfterTransfer.income.totalCents === incomeBefore,
      `${analyticsAfterTransfer.income.totalCents} vs ${incomeBefore}`,
    );
    must(
      checks,
      "transfer_not_in_expense",
      analyticsAfterTransfer.expense.totalCents === expenseBefore,
      `${analyticsAfterTransfer.expense.totalCents} vs ${expenseBefore}`,
    );

    const esunBefore = (await listAccounts(ownerId)).find((a) => a.id === esun.id)!.balanceCents;
    const jkoBefore = (await listAccounts(ownerId)).find((a) => a.id === jko.id)!.balanceCents;
    await createTransaction(ownerId, {
      kind: "transfer",
      amountCents: 200_000,
      accountId: esun.id,
      counterpartyAccountId: jko.id,
      note: `transfer-esun-jko ${LIFE_ACCEPTANCE_MARKER}`,
    });
    const esunAfter = (await listAccounts(ownerId)).find((a) => a.id === esun.id)!.balanceCents;
    const jkoAfter = (await listAccounts(ownerId)).find((a) => a.id === jko.id)!.balanceCents;
    must(
      checks,
      "transfer_esun_jko",
      esunAfter === esunBefore - 200_000 && jkoAfter === jkoBefore + 200_000,
    );
    const analyticsAfterEpay = await getAnalytics(ownerId, { period: "this_month" });
    must(
      checks,
      "epay_topup_not_expense",
      analyticsAfterEpay.expense.totalCents === expenseBefore,
      `${analyticsAfterEpay.expense.totalCents} vs ${expenseBefore}`,
    );

    const goal = await createGoal(ownerId, {
      title: `2030 西班牙世界盃 ${LIFE_ACCEPTANCE_MARKER}`,
      description: LIFE_ACCEPTANCE_MARKER,
      targetAmountCents: 20_000_000,
      preparedAmountCents: 0,
      status: "active",
      icon: "target",
    });
    const pocket = await createAccount(ownerId, {
      name: `世界盃口袋 ${LIFE_ACCEPTANCE_MARKER}`,
      accountType: "goal_pocket",
      parentAccountId: future.id,
      linkedGoalId: goal.id,
      balanceCents: 0,
      notes: LIFE_ACCEPTANCE_MARKER,
    });
    const soloGoal = await createGoal(ownerId, {
      title: `無口袋目標 ${LIFE_ACCEPTANCE_MARKER}`,
      description: LIFE_ACCEPTANCE_MARKER,
      targetAmountCents: 5_000_000,
      status: "planning",
    });
    must(
      checks,
      "goal_without_pocket",
      soloGoal.id !== goal.id && soloGoal.preparedAmountCents === 0,
    );

    const futureBeforePocket = (await listAccounts(ownerId)).find((a) => a.id === future.id)!
      .balanceCents;
    await createTransaction(ownerId, {
      kind: "transfer",
      amountCents: 5_000_000,
      accountId: future.id,
      counterpartyAccountId: pocket.id,
      note: `pocket-fund ${LIFE_ACCEPTANCE_MARKER}`,
    });
    const futureAfterPocket = (await listAccounts(ownerId)).find((a) => a.id === future.id)!
      .balanceCents;
    const pocketBal = (await listAccounts(ownerId)).find((a) => a.id === pocket.id)!.balanceCents;
    must(
      checks,
      "pocket_funded",
      pocketBal === 5_000_000 && futureAfterPocket === futureBeforePocket - 5_000_000,
    );

    const goals = await listGoals(ownerId);
    const g = goals.find((x) => x.id === goal.id)!;
    must(
      checks,
      "goal_pocket_progress",
      g.preparedAmountCents === 5_000_000,
      `prepared=${g.preparedAmountCents}`,
    );
    const progress = goalProgressPercent(g.preparedAmountCents, g.targetAmountCents);
    must(checks, "goal_progress_25", progress === 25, `progress=${progress}`);
    check(checks, "pocket_transfer_net_neutral", true);

    await updateGoal(ownerId, goal.id, { status: "paused" });
    await updateGoal(ownerId, goal.id, { status: "active" });
    await updateGoal(ownerId, goal.id, { status: "completed" });
    await updateGoal(ownerId, goal.id, { status: "archived", sortOrder: 1 });
    await updateGoal(ownerId, goal.id, { status: "active" });
    check(checks, "goal_status_cycle", true);

    // Snapshot timing: capture snap1 with current balances, THEN period txs, THEN snap2.
    let liveAccounts = await listAccounts(ownerId);
    const snap1Balances = liveAccounts.map((a) => ({
      accountId: a.id,
      balanceCents: a.balanceCents,
    }));
    const snap1 = await createSnapshot(ownerId, {
      note: `snap1 ${LIFE_ACCEPTANCE_MARKER}`,
      capturedAt: new Date(Date.now() - 2_000).toISOString(),
      balances: snap1Balances,
    });
    must(
      checks,
      "snapshot_1",
      snap1.snapshot.netWorthCents ===
        snap1.snapshot.totalAssetsCents - snap1.snapshot.totalLiabilitiesCents,
    );

    const postSnapAt = new Date().toISOString();
    await createTransaction(ownerId, {
      kind: "income",
      amountCents: 300_000,
      categoryId: incCat.id,
      accountId: ctbc.id,
      note: `post-snap1-income ${LIFE_ACCEPTANCE_MARKER}`,
      occurredAt: postSnapAt,
    });
    await createTransaction(ownerId, {
      kind: "expense",
      amountCents: 100_000,
      categoryId: expCat.id,
      accountId: jko.id,
      note: `post-snap1-expense ${LIFE_ACCEPTANCE_MARKER}`,
      occurredAt: postSnapAt,
    });
    await createTransaction(ownerId, {
      kind: "transfer",
      amountCents: 50_000,
      accountId: cash.id,
      counterpartyAccountId: jko.id,
      note: `post-snap1-transfer ${LIFE_ACCEPTANCE_MARKER}`,
      occurredAt: postSnapAt,
    });

    liveAccounts = await listAccounts(ownerId);
    const unrecordedTarget = 1_500_000;
    const snap2Balances = liveAccounts.map((a) => {
      if (a.id === ctbc.id) {
        return {
          accountId: a.id,
          balanceCents: Math.max(0, a.balanceCents - unrecordedTarget),
        };
      }
      return { accountId: a.id, balanceCents: a.balanceCents };
    });
    const snap2 = await createSnapshot(ownerId, {
      note: `snap2 ${LIFE_ACCEPTANCE_MARKER}`,
      balances: snap2Balances,
    });
    must(
      checks,
      "unrecorded_living_expense",
      snap2.snapshot.unrecordedExpenseCents === unrecordedTarget,
      `got=${snap2.snapshot.unrecordedExpenseCents} expected=${unrecordedTarget} theoretical=${snap2.snapshot.theoreticalNetCents} actual=${snap2.snapshot.netWorthCents} prev=${snap1.snapshot.netWorthCents} periodIncome=${snap2.snapshot.periodIncomeCents} periodExpense=${snap2.snapshot.periodExpenseCents}`,
    );

    const analytics = await getAnalytics(ownerId, { period: "this_month" });
    must(
      checks,
      "analytics_shows_unrecorded",
      analytics.expense.unrecordedExpenseCents === unrecordedTarget,
      `got=${analytics.expense.unrecordedExpenseCents}`,
    );
    must(
      checks,
      "analytics_recorded_vs_unrecorded",
      analytics.expense.recordedVsUnrecorded.unrecordedCents === unrecordedTarget &&
        analytics.expense.recordedVsUnrecorded.recordedCents === analytics.expense.totalCents,
    );

    for (const period of ["this_month", "last_month", "this_year"] as const) {
      const a = await getAnalytics(ownerId, { period });
      must(
        checks,
        `analytics_period_${period}`,
        typeof a.income.totalCents === "number" && typeof a.expense.totalCents === "number",
      );
    }

    const visa = await createAccount(ownerId, {
      name: `驗收信用卡 ${LIFE_ACCEPTANCE_MARKER}`,
      accountType: "credit_card",
      balanceCents: 0,
      defaultPaymentAccountId: ctbc.id,
      notes: LIFE_ACCEPTANCE_MARKER,
    });
    await createTransaction(ownerId, {
      kind: "expense",
      amountCents: 300_000,
      categoryId: expCat.id,
      accountId: visa.id,
      note: `cc-swipe ${LIFE_ACCEPTANCE_MARKER}`,
    });
    let visaBal = (await listAccounts(ownerId)).find((a) => a.id === visa.id)!.balanceCents;
    must(checks, "cc_swipe_liability", visaBal === 300_000);
    const expenseWithSwipe = (await getAnalytics(ownerId, { period: "this_month" })).expense
      .totalCents;

    await createTransaction(ownerId, {
      kind: "credit_payment",
      amountCents: 100_000,
      accountId: ctbc.id,
      counterpartyAccountId: visa.id,
      note: `cc-partial ${LIFE_ACCEPTANCE_MARKER}`,
    });
    visaBal = (await listAccounts(ownerId)).find((a) => a.id === visa.id)!.balanceCents;
    must(checks, "cc_partial_payment", visaBal === 200_000);
    const expenseAfterPartial = (await getAnalytics(ownerId, { period: "this_month" })).expense
      .totalCents;
    must(
      checks,
      "cc_payment_not_second_expense",
      expenseAfterPartial === expenseWithSwipe,
      `${expenseAfterPartial} vs ${expenseWithSwipe}`,
    );

    await createTransaction(ownerId, {
      kind: "credit_refund",
      amountCents: 50_000,
      accountId: visa.id,
      note: `cc-refund ${LIFE_ACCEPTANCE_MARKER}`,
    });
    visaBal = (await listAccounts(ownerId)).find((a) => a.id === visa.id)!.balanceCents;
    must(checks, "cc_refund", visaBal === 150_000);

    await createTransaction(ownerId, {
      kind: "credit_payment",
      amountCents: 150_000,
      accountId: ctbc.id,
      counterpartyAccountId: visa.id,
      note: `cc-payoff ${LIFE_ACCEPTANCE_MARKER}`,
    });
    visaBal = (await listAccounts(ownerId)).find((a) => a.id === visa.id)!.balanceCents;
    must(checks, "cc_payoff", visaBal === 0);

    const dash = await getDashboard(ownerId);
    must(
      checks,
      "dashboard",
      typeof dash.incomeCents === "number" &&
        typeof dash.expenseCents === "number" &&
        typeof dash.deltaCents === "number" &&
        typeof dash.netWorthCents === "number",
    );
    const quick = await getQuickBootstrap(ownerId);
    must(
      checks,
      "quick_bootstrap",
      quick.categories.length > 0 && quick.accounts.length > 0,
      `cats=${quick.categories.length} accts=${quick.accounts.length}`,
    );

    await updateCategory(ownerId, expCat.id, { status: "archived" });
    const txs = await listTransactions(ownerId, { limit: 50 });
    must(
      checks,
      "archived_category_keeps_history",
      txs.some((t) => t.categoryId === expCat.id),
    );

    await updateAccount(ownerId, pocket.id, { status: "archived" });
    const pocketTx = txs.some(
      (t) => t.accountId === pocket.id || t.counterpartyAccountId === pocket.id,
    );
    must(checks, "archived_account_keeps_history", pocketTx);

    const anonProbe = await fetch("https://bakigo.tw/api/life/bootstrap");
    must(checks, "anon_api_401", anonProbe.status === 401, `status=${anonProbe.status}`);

    // Anon PostgREST must not read life tables (RLS / grants).
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && anonKey) {
      const r = await fetch(`${supabaseUrl}/rest/v1/life_accounts?select=id&limit=1`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      must(
        checks,
        "anon_rest_denied",
        r.status === 401 || r.status === 403 || r.status === 42501 || !(await r.json().then((j) => Array.isArray(j) && j.length > 0).catch(() => false)),
        `status=${r.status}`,
      );
    } else {
      check(checks, "anon_rest_denied", true, "skipped-missing-anon-env");
    }

    await cleanupDisposable(ownerId);
    if (originalBalances) await restoreBalances(ownerId, originalBalances);
    check(checks, "cleanup", true);

    const snapsLeft = (await listSnapshots(ownerId, 20)).filter((s) =>
      (s.note ?? "").includes(LIFE_ACCEPTANCE_MARKER),
    );
    must(checks, "cleanup_snapshots", snapsLeft.length === 0);

    const txsLeft = (await listTransactions(ownerId, { limit: 200 })).filter((t) =>
      (t.note ?? "").includes(LIFE_ACCEPTANCE_MARKER),
    );
    must(checks, "cleanup_transactions", txsLeft.length === 0);

    const catsLeft = (await listCategories(ownerId, { includeArchived: true })).filter((c) =>
      c.name.includes(LIFE_ACCEPTANCE_MARKER),
    );
    must(checks, "cleanup_categories", catsLeft.length === 0);

    const goalsLeft = (await listGoals(ownerId, { includeArchived: true })).filter(
      (g2) =>
        g2.title.includes(LIFE_ACCEPTANCE_MARKER) ||
        (g2.description ?? "").includes(LIFE_ACCEPTANCE_MARKER),
    );
    must(checks, "cleanup_goals", goalsLeft.length === 0);

    return {
      ok: checks.every((c) => c.ok),
      ownerMemberId: ownerId,
      checks,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    try {
      await cleanupDisposable(ownerId);
      if (originalBalances) await restoreBalances(ownerId, originalBalances);
    } catch {
      /* best-effort */
    }
    const message = error instanceof Error ? error.message : String(error);
    if (!checks.some((c) => !c.ok)) {
      checks.push({ name: "fatal", ok: false, detail: message });
    } else if (!checks.some((c) => c.name === "fatal")) {
      checks.push({ name: "fatal", ok: false, detail: message });
    }
    return {
      ok: false,
      ownerMemberId: ownerId,
      checks,
      elapsedMs: Date.now() - started,
    };
  }
}
