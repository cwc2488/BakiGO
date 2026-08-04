import type {
  BakiEvent,
  BakiEventCreateInput,
} from "@/types/baki-event";
import type { EntityId, RetailTransaction } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";
import { createRetailRepository } from "./retail-repository";

export interface EventRepository {
  getAll(): BakiEvent[];
  getByMemberId(memberId: EntityId): BakiEvent[];
  create(input: BakiEventCreateInput): BakiEvent;
}

function parseEvents(raw: string | null): BakiEvent[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as BakiEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function transactionToEvent(transaction: RetailTransaction): BakiEvent {
  return {
    id: transaction.id,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    organizationId: transaction.organizationId,
    memberId: transaction.memberId,
    eventTypeKey: transaction.transactionTypeKey,
    eventCategory: "transaction",
    eventDate: transaction.transactionDate,
    value: transaction.amount,
    retailHouseKey: transaction.retailHouseKey,
    metadata: {
      customerName: transaction.customerName,
      currencyCode: transaction.currencyCode,
      note: transaction.note,
      productKey: transaction.productKey,
    },
  };
}

export class LocalStorageEventRepository implements EventRepository {
  constructor(private readonly storage: StorageAdapter) {}

  getAll(): BakiEvent[] {
    this.migrateLegacyTransactionsIfNeeded();
    return parseEvents(this.storage.getItem(STORAGE_KEYS.bakiEvents));
  }

  getByMemberId(memberId: EntityId): BakiEvent[] {
    return this.getAll().filter((event) => event.memberId === memberId);
  }

  create(input: BakiEventCreateInput): BakiEvent {
    const now = new Date().toISOString();
    const event: BakiEvent = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      ...input,
    };

    const next = [...this.getAll(), event];
    this.storage.setItem(STORAGE_KEYS.bakiEvents, JSON.stringify(next));
    return event;
  }

  private migrateLegacyTransactionsIfNeeded(): void {
    if (this.storage.getItem(STORAGE_KEYS.eventsMigrated) === "true") {
      return;
    }

    const existing = parseEvents(this.storage.getItem(STORAGE_KEYS.bakiEvents));
    if (existing.length > 0) {
      this.storage.setItem(STORAGE_KEYS.eventsMigrated, "true");
      return;
    }

    const retailRepository = createRetailRepository(this.storage);
    const legacyTransactions = retailRepository.getAll();
    if (legacyTransactions.length === 0) {
      this.storage.setItem(STORAGE_KEYS.eventsMigrated, "true");
      return;
    }

    const migrated = legacyTransactions.map(transactionToEvent);
    this.storage.setItem(STORAGE_KEYS.bakiEvents, JSON.stringify(migrated));
    this.storage.setItem(STORAGE_KEYS.eventsMigrated, "true");
  }
}

export function createEventRepository(storage: StorageAdapter): EventRepository {
  return new LocalStorageEventRepository(storage);
}
