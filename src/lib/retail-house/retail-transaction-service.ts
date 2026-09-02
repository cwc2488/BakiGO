import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { getEventTypeDefinition } from "@/lib/event-center/event-types";
import { isCustomerTransactionType } from "@/lib/retail-house/resolve-transaction-points";
import {
  addRetailTransactionDeletionTombstone,
} from "@/lib/retail-house/retail-transaction-deletion-tombstones";
import {
  validateRetailTransactionMutation as validateRetailTransactionMutationPure,
  type RetailTransactionMutationInput,
} from "@/lib/retail-house/retail-transaction-validation";
import {
  createEventRepository,
  migrateRetailTransactionToBakiEvent,
} from "@/lib/repositories/event-repository";
import { createRetailRepository } from "@/lib/repositories/retail-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { flushPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";
import {
  recalculateMemberMetrics,
  type MemberComputedMetrics,
} from "@/lib/services/recalculate-member-metrics";
import type { BakiEvent } from "@/types/baki-event";
import type { EntityId, ISODateString } from "@/types";
import type { RetailTransaction } from "@/types/retail-transaction";

export type { RetailTransactionMutationInput };

export interface AuthoritativeRetailMutationTarget {
  transactionId: EntityId;
  memberId: EntityId;
  event: BakiEvent | null;
  legacy: RetailTransaction | null;
  /** Date used for metrics recalculation. */
  referenceEventDate: ISODateString;
  /** Metadata baseline for updates. */
  priorMetadata: Record<string, unknown> | undefined;
}

function getTransactionCurrencyCode(typeKey: string): string {
  const config = DEFAULT_BUSINESS_RULES.retailTransactionTypes.find(
    (type) => type.key === typeKey,
  );
  return config?.currencyCode ?? "TWD";
}

function resolveReferenceDate(eventDate: ISODateString): ISODateString {
  const today = todayISODate();
  return eventDate > today ? today : eventDate;
}

export function validateRetailTransactionMutation(
  input: RetailTransactionMutationInput,
  referenceDate: ISODateString = todayISODate(),
): { eventDate: ISODateString } | { error: string } {
  return validateRetailTransactionMutationPure(input, referenceDate);
}

function buildTransactionMetadata(
  input: RetailTransactionMutationInput,
  priorMetadata?: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...(priorMetadata ?? {}),
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone?.trim() || undefined,
    currencyCode: getTransactionCurrencyCode(input.eventTypeKey),
    note: input.note?.trim() || undefined,
  };
  if (isCustomerTransactionType(input.eventTypeKey) && input.retailVp !== undefined && input.retailVp !== null) {
    next.retailVp = input.retailVp;
  } else {
    delete next.retailVp;
  }
  return next;
}

/**
 * Resolve mutation target from authoritative union (events ∪ legacy).
 * Not-found only when neither store contains the id for this member.
 */
export function resolveAuthoritativeRetailTransactionForMutation(
  transactionId: EntityId,
  memberId: EntityId,
  storage: StorageAdapter,
): AuthoritativeRetailMutationTarget {
  const eventRepository = createEventRepository(storage);
  const retailRepository = createRetailRepository(storage);

  const eventRaw = eventRepository.getById(transactionId);
  let event: BakiEvent | null = null;
  if (eventRaw && eventRaw.eventCategory === "transaction") {
    if (eventRaw.memberId === memberId) {
      event = eventRaw;
    } else {
      const exactOwnedEvents = eventRepository
        .getAll()
        .filter(
          (row) => row.memberId === memberId && row.eventCategory === "transaction",
        );
      if (exactOwnedEvents.length === 0) {
        event = eventRaw;
      }
    }
  }

  const legacyRaw = retailRepository.getById(transactionId);
  let legacy: RetailTransaction | null = null;
  if (legacyRaw) {
    if (legacyRaw.memberId === memberId) {
      legacy = legacyRaw;
    } else {
      // Device claim: no exact-member legacy rows exist → treat sole-device
      // stale-id rows as the authenticated member's (same as reconcile).
      const exactOwned = retailRepository
        .getAll()
        .filter((row) => row.memberId === memberId);
      if (exactOwned.length === 0) {
        legacy = legacyRaw;
      }
    }
  }

  if (!event && !legacy) {
    throw new Error("找不到這筆成交紀錄。");
  }

  const referenceEventDate = (event?.eventDate ??
    legacy?.transactionDate ??
    todayISODate()) as ISODateString;
  const priorMetadata = (event?.metadata ?? legacy?.metadata) as
    | Record<string, unknown>
    | undefined;

  return {
    transactionId,
    memberId,
    event,
    legacy,
    referenceEventDate,
    priorMetadata,
  };
}

function upsertOwnedTransactionEvent(
  storage: StorageAdapter,
  event: BakiEvent,
): void {
  const repository = createEventRepository(storage);
  const existing = repository.getById(event.id);
  if (existing) {
    repository.update(event.id, {
      eventTypeKey: event.eventTypeKey,
      eventDate: event.eventDate,
      value: event.value,
      metadata: event.metadata,
    });
    return;
  }
  // Preserve stable id (legacy → event convergence).
  const all = repository.getAll();
  storage.setItem(STORAGE_KEYS.bakiEvents, JSON.stringify([...all, event]));
}

/**
 * Delete from whichever authoritative stores contain the row.
 * Always records a tombstone so merge-first cloud sync cannot resurrect it.
 */
export function deleteRetailTransactionForCurrentMember(
  transactionId: EntityId,
  storage: StorageAdapter,
): MemberComputedMetrics {
  const memberId = resolveAuthenticatedMemberId(storage);
  const target = resolveAuthoritativeRetailTransactionForMutation(
    transactionId,
    memberId,
    storage,
  );

  if (target.event) {
    createEventRepository(storage).delete(transactionId);
  }
  if (target.legacy || createRetailRepository(storage).getById(transactionId)) {
    createRetailRepository(storage).delete(transactionId);
  }

  addRetailTransactionDeletionTombstone(storage, {
    transactionId,
    memberId,
  });
  flushPendingCloudSync();

  return recalculateMemberMetrics(
    {
      memberId,
      referenceDate: resolveReferenceDate(target.referenceEventDate),
      includeMapUniverse: false,
    },
    storage,
  );
}

export function updateRetailTransactionForCurrentMember(
  transactionId: EntityId,
  input: RetailTransactionMutationInput,
  storage: StorageAdapter,
): MemberComputedMetrics {
  const memberId = resolveAuthenticatedMemberId(storage);
  const validated = validateRetailTransactionMutation(input);
  if ("error" in validated) {
    throw new Error(validated.error);
  }

  const target = resolveAuthoritativeRetailTransactionForMutation(
    transactionId,
    memberId,
    storage,
  );
  const metadata = buildTransactionMetadata(input, target.priorMetadata);

  if (target.event) {
    createEventRepository(storage).update(transactionId, {
      eventTypeKey: input.eventTypeKey,
      eventDate: validated.eventDate,
      value: input.value,
      metadata,
    });
  } else if (target.legacy) {
    // Legacy-only: converge into event-sourced path with the same stable id.
    const converged = migrateRetailTransactionToBakiEvent({
      ...target.legacy,
      memberId,
      transactionTypeKey: input.eventTypeKey,
      transactionDate: validated.eventDate,
      amount: input.value,
      customerName: input.customerName.trim(),
      note: input.note?.trim() || undefined,
      metadata,
      updatedAt: new Date().toISOString(),
    });
    upsertOwnedTransactionEvent(storage, {
      ...converged,
      eventTypeKey: input.eventTypeKey,
      eventDate: validated.eventDate,
      value: input.value,
      metadata,
    });
  }

  const retailRepository = createRetailRepository(storage);
  if (retailRepository.getById(transactionId)) {
    retailRepository.update(transactionId, {
      memberId,
      transactionTypeKey: input.eventTypeKey,
      transactionDate: validated.eventDate,
      amount: input.value,
      customerName: input.customerName.trim(),
      currencyCode: getTransactionCurrencyCode(input.eventTypeKey),
      note: input.note?.trim() || undefined,
      metadata,
    });
  }

  flushPendingCloudSync();

  return recalculateMemberMetrics(
    {
      memberId,
      referenceDate: resolveReferenceDate(validated.eventDate),
      includeMapUniverse: false,
    },
    storage,
  );
}

export function createRetailTransactionForCurrentMember(
  input: RetailTransactionMutationInput,
  storage: StorageAdapter,
): MemberComputedMetrics {
  const memberId = resolveAuthenticatedMemberId(storage);
  const validated = validateRetailTransactionMutation(input);
  if ("error" in validated) {
    throw new Error(validated.error);
  }

  const definition = getEventTypeDefinition(input.eventTypeKey);
  if (!definition) {
    throw new Error("請選擇有效的成交類型。");
  }

  const repository = createEventRepository(storage);
  repository.create({
    organizationId: APP_IDS.organizationId,
    memberId,
    eventTypeKey: input.eventTypeKey,
    eventCategory: "transaction",
    eventDate: validated.eventDate,
    value: input.value,
    retailHouseKey: APP_IDS.defaultRetailHouseKey,
    metadata: buildTransactionMetadata(input),
  });
  flushPendingCloudSync();

  return recalculateMemberMetrics(
    {
      memberId,
      referenceDate: resolveReferenceDate(validated.eventDate),
      includeMapUniverse: false,
    },
    storage,
  );
}
