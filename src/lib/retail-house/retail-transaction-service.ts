import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { getEventTypeDefinition } from "@/lib/event-center/event-types";
import { isCustomerTransactionType } from "@/lib/retail-house/resolve-transaction-points";
import {
  validateRetailTransactionMutation as validateRetailTransactionMutationPure,
  type RetailTransactionMutationInput,
} from "@/lib/retail-house/retail-transaction-validation";
import { createEventRepository } from "@/lib/repositories/event-repository";
import { createRetailRepository } from "@/lib/repositories/retail-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { flushPendingCloudSync } from "@/lib/repositories/syncing-storage-adapter";
import {
  recalculateMemberMetrics,
  type MemberComputedMetrics,
} from "@/lib/services/recalculate-member-metrics";
import type { EntityId, ISODateString } from "@/types";

export type { RetailTransactionMutationInput };

function getTransactionCurrencyCode(typeKey: string): string {
  const config = DEFAULT_BUSINESS_RULES.retailTransactionTypes.find(
    (type) => type.key === typeKey,
  );
  return config?.currencyCode ?? "TWD";
}

function assertOwnedTransactionEvent(
  eventId: EntityId,
  memberId: EntityId,
  storage: StorageAdapter,
) {
  const repository = createEventRepository(storage);
  const event = repository.getById(eventId);
  if (!event || event.memberId !== memberId || event.eventCategory !== "transaction") {
    throw new Error("找不到這筆成交紀錄。");
  }
  return { repository, event };
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
    // Preserve numeric 0 — do not use truthy checks (vp || default).
    next.retailVp = input.retailVp;
  } else {
    delete next.retailVp;
  }
  return next;
}

/**
 * Own RH list reads events ∪ legacy retailTransactions.
 * Mutations must update/delete BOTH stores or deleted/edited cards resurface.
 */
function syncLegacyRetailTransactionMirror(
  storage: StorageAdapter,
  eventId: EntityId,
  patch:
    | { kind: "delete" }
    | {
        kind: "update";
        memberId: EntityId;
        eventTypeKey: string;
        eventDate: ISODateString;
        value: number;
        metadata: Record<string, unknown>;
      },
): void {
  const retailRepository = createRetailRepository(storage);
  if (patch.kind === "delete") {
    retailRepository.delete(eventId);
    return;
  }

  const existing = retailRepository.getById(eventId);
  if (!existing) {
    return;
  }

  const customerName =
    typeof patch.metadata.customerName === "string"
      ? patch.metadata.customerName
      : existing.customerName;
  const currencyCode =
    typeof patch.metadata.currencyCode === "string"
      ? patch.metadata.currencyCode
      : existing.currencyCode;
  const note =
    typeof patch.metadata.note === "string" ? patch.metadata.note : existing.note;

  retailRepository.update(eventId, {
    memberId: patch.memberId,
    transactionTypeKey: patch.eventTypeKey,
    transactionDate: patch.eventDate,
    amount: patch.value,
    customerName,
    currencyCode,
    note,
    metadata: patch.metadata,
  });
}

export function updateRetailTransactionForCurrentMember(
  eventId: EntityId,
  input: RetailTransactionMutationInput,
  storage: StorageAdapter,
): MemberComputedMetrics {
  const memberId = resolveAuthenticatedMemberId(storage);
  const validated = validateRetailTransactionMutation(input);
  if ("error" in validated) {
    throw new Error(validated.error);
  }

  const { repository, event } = assertOwnedTransactionEvent(eventId, memberId, storage);
  const metadata = buildTransactionMetadata(
    input,
    event.metadata as Record<string, unknown> | undefined,
  );
  repository.update(eventId, {
    eventTypeKey: input.eventTypeKey,
    eventDate: validated.eventDate,
    value: input.value,
    metadata,
  });
  syncLegacyRetailTransactionMirror(storage, eventId, {
    kind: "update",
    memberId,
    eventTypeKey: input.eventTypeKey,
    eventDate: validated.eventDate,
    value: input.value,
    metadata,
  });
  flushPendingCloudSync();

  return recalculateMemberMetrics(
    {
      memberId,
      referenceDate: resolveReferenceDate(validated.eventDate),
    },
    storage,
  );
}

export function deleteRetailTransactionForCurrentMember(
  eventId: EntityId,
  storage: StorageAdapter,
): MemberComputedMetrics {
  const memberId = resolveAuthenticatedMemberId(storage);
  const { repository, event } = assertOwnedTransactionEvent(eventId, memberId, storage);
  repository.delete(eventId);
  // Authoritative RH merge resurrects legacy rows when events are deleted alone.
  syncLegacyRetailTransactionMirror(storage, eventId, { kind: "delete" });
  flushPendingCloudSync();

  return recalculateMemberMetrics(
    {
      memberId,
      referenceDate: resolveReferenceDate(event.eventDate),
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
    },
    storage,
  );
}
