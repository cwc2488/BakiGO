import type { EntityId, ISODateString, RetailTransaction, RetailTransactionCreateInput } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";

export interface RetailRepository {
  getAll(): RetailTransaction[];
  getByMemberId(memberId: EntityId): RetailTransaction[];
  getById(id: EntityId): RetailTransaction | null;
  create(input: RetailTransactionCreateInput): RetailTransaction;
  update(id: EntityId, patch: Partial<RetailTransaction>): RetailTransaction | null;
  delete(id: EntityId): boolean;
}

function parseTransactions(raw: string | null): RetailTransaction[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as RetailTransaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `retail-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class LocalStorageRetailRepository implements RetailRepository {
  constructor(private readonly storage: StorageAdapter) {}

  getAll(): RetailTransaction[] {
    return parseTransactions(this.storage.getItem(STORAGE_KEYS.retailTransactions));
  }

  getByMemberId(memberId: EntityId): RetailTransaction[] {
    return this.getAll().filter((transaction) => transaction.memberId === memberId);
  }

  getById(id: EntityId): RetailTransaction | null {
    return this.getAll().find((transaction) => transaction.id === id) ?? null;
  }

  create(input: RetailTransactionCreateInput): RetailTransaction {
    const now = new Date().toISOString();
    const transaction: RetailTransaction = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      ...input,
    };

    const next = [...this.getAll(), transaction];
    this.storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify(next));
    return transaction;
  }

  update(id: EntityId, patch: Partial<RetailTransaction>): RetailTransaction | null {
    const all = this.getAll();
    const index = all.findIndex((transaction) => transaction.id === id);
    if (index < 0) {
      return null;
    }
    const current = all[index]!;
    const updated: RetailTransaction = {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      metadata: patch.metadata
        ? { ...(current.metadata ?? {}), ...patch.metadata }
        : current.metadata,
    };
    const next = [...all];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify(next));
    return updated;
  }

  delete(id: EntityId): boolean {
    const all = this.getAll();
    const next = all.filter((transaction) => transaction.id !== id);
    if (next.length === all.length) {
      return false;
    }
    this.storage.setItem(STORAGE_KEYS.retailTransactions, JSON.stringify(next));
    return true;
  }
}

export function createRetailRepository(storage: StorageAdapter): RetailRepository {
  return new LocalStorageRetailRepository(storage);
}

export function toVpEngineTransactions(transactions: RetailTransaction[]) {
  return transactions.map((transaction) => ({
    id: transaction.id,
    memberId: transaction.memberId,
    transactionDate: transaction.transactionDate as ISODateString,
    transactionTypeKey: transaction.transactionTypeKey,
    amount: transaction.amount,
    productKey: transaction.productKey ?? null,
    retailHouseKey: transaction.retailHouseKey,
  }));
}

export function toEngineTransactions(transactions: RetailTransaction[]) {
  return transactions.map((transaction) => ({
    memberId: transaction.memberId,
    transactionDate: transaction.transactionDate as ISODateString,
    transactionTypeKey: transaction.transactionTypeKey,
    amount: transaction.amount,
    currencyCode: transaction.currencyCode,
    retailHouseKey: transaction.retailHouseKey,
  }));
}
