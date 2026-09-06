import type { LifeAccount, LifeAccountType, LifeTransaction } from "@/types/life";
import { LIFE_ASSET_ACCOUNT_TYPES, LIFE_LIABILITY_ACCOUNT_TYPES } from "@/types/life";

export function isAssetAccountType(type: LifeAccountType): boolean {
  return LIFE_ASSET_ACCOUNT_TYPES.includes(type);
}

export function isLiabilityAccountType(type: LifeAccountType): boolean {
  return LIFE_LIABILITY_ACCOUNT_TYPES.includes(type);
}

export function sumAssetCents(accounts: Pick<LifeAccount, "accountType" | "balanceCents" | "status">[]): number {
  return accounts
    .filter((a) => a.status === "active" && isAssetAccountType(a.accountType))
    .reduce((sum, a) => sum + a.balanceCents, 0);
}

export function sumLiabilityCents(
  accounts: Pick<LifeAccount, "accountType" | "balanceCents" | "status">[],
): number {
  return accounts
    .filter((a) => a.status === "active" && isLiabilityAccountType(a.accountType))
    .reduce((sum, a) => sum + a.balanceCents, 0);
}

export function netWorthCents(
  accounts: Pick<LifeAccount, "accountType" | "balanceCents" | "status">[],
): number {
  return sumAssetCents(accounts) - sumLiabilityCents(accounts);
}

/** Goal progress percent 0–100, or null when no target. */
export function goalProgressPercent(
  preparedCents: number,
  targetCents: number | null | undefined,
): number | null {
  if (targetCents == null || targetCents <= 0) return null;
  return Math.min(100, Math.round((preparedCents / targetCents) * 100));
}

/**
 * Unrecorded living expense between two snapshots.
 * theoretical = previousNet + periodIncome − periodExpense
 * unrecorded = max(0, theoretical − actualNet)
 */
export function computeUnrecordedExpenseCents(input: {
  previousNetCents: number;
  periodIncomeCents: number;
  periodExpenseCents: number;
  actualNetCents: number;
}): {
  theoreticalNetCents: number;
  unrecordedExpenseCents: number;
} {
  const theoreticalNetCents =
    input.previousNetCents + input.periodIncomeCents - input.periodExpenseCents;
  const unrecordedExpenseCents = Math.max(0, theoreticalNetCents - input.actualNetCents);
  return { theoreticalNetCents, unrecordedExpenseCents };
}

export function sumTransactionsByKind(
  transactions: Pick<LifeTransaction, "kind" | "amountCents">[],
  kind: LifeTransaction["kind"],
): number {
  return transactions
    .filter((t) => t.kind === kind)
    .reduce((sum, t) => sum + t.amountCents, 0);
}

/** Credit refund reduces expense stats for the period. */
export function netExpenseCentsForStats(
  transactions: Pick<LifeTransaction, "kind" | "amountCents">[],
): number {
  const expense = sumTransactionsByKind(transactions, "expense");
  const refund = sumTransactionsByKind(transactions, "credit_refund");
  return Math.max(0, expense - refund);
}

export function netIncomeCentsForStats(
  transactions: Pick<LifeTransaction, "kind" | "amountCents">[],
): number {
  return sumTransactionsByKind(transactions, "income");
}

/**
 * Apply a ledger event to in-memory account balances (pure).
 * Credit card balance = liability owed.
 */
export function applyLedgerDelta(
  accountsById: Map<string, { accountType: LifeAccountType; balanceCents: number }>,
  event: {
    kind: LifeTransaction["kind"];
    amountCents: number;
    accountId: string | null;
    counterpartyAccountId: string | null;
    direction: 1 | -1;
  },
): Map<string, { accountType: LifeAccountType; balanceCents: number }> {
  const next = new Map(accountsById);
  const amt = event.amountCents * event.direction;

  const bump = (id: string, delta: number) => {
    const row = next.get(id);
    if (!row) throw new Error("帳戶不存在");
    next.set(id, { ...row, balanceCents: row.balanceCents + delta });
  };

  switch (event.kind) {
    case "income": {
      if (!event.accountId) throw new Error("缺少帳戶");
      bump(event.accountId, amt);
      break;
    }
    case "expense": {
      if (!event.accountId) throw new Error("缺少帳戶");
      const acct = next.get(event.accountId);
      if (!acct) throw new Error("帳戶不存在");
      if (acct.accountType === "credit_card") {
        // Liability increases on swipe
        bump(event.accountId, amt);
      } else {
        bump(event.accountId, -amt);
      }
      break;
    }
    case "transfer": {
      if (!event.accountId || !event.counterpartyAccountId) {
        throw new Error("轉帳需要來源與目標帳戶");
      }
      bump(event.accountId, -amt);
      bump(event.counterpartyAccountId, amt);
      break;
    }
    case "credit_payment": {
      // accountId = bank (asset −), counterparty = credit card (liability −)
      if (!event.accountId || !event.counterpartyAccountId) {
        throw new Error("繳款需要銀行與信用卡");
      }
      bump(event.accountId, -amt);
      bump(event.counterpartyAccountId, -amt);
      break;
    }
    case "credit_refund": {
      // accountId = credit card (liability −); optional counterparty restore asset
      if (!event.accountId) throw new Error("退款需要信用卡");
      bump(event.accountId, -amt);
      if (event.counterpartyAccountId) {
        bump(event.counterpartyAccountId, amt);
      }
      break;
    }
    default:
      throw new Error("未知交易類型");
  }
  return next;
}

export function taipeiMonthBounds(now = new Date()): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  // Taipei midnight as UTC+8
  const start = new Date(`${y}-${m}-01T00:00:00+08:00`);
  const nextMonth = Number(m) === 12 ? `${Number(y) + 1}-01` : `${y}-${String(Number(m) + 1).padStart(2, "0")}`;
  const end = new Date(`${nextMonth}-01T00:00:00+08:00`);
  return { start, end };
}

export function previousTaipeiMonthBounds(now = new Date()): { start: Date; end: Date } {
  const { start } = taipeiMonthBounds(now);
  const prev = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  return taipeiMonthBounds(prev);
}

export function taipeiYearBounds(now = new Date()): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
  });
  const y = fmt.format(now);
  const start = new Date(`${y}-01-01T00:00:00+08:00`);
  const end = new Date(`${Number(y) + 1}-01-01T00:00:00+08:00`);
  return { start, end };
}
