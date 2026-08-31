/**
 * Own-data reconciliation: local authoritative RH (bakiEvents ∪ retailTransactions)
 * → authenticated member's member_app_data.
 *
 * Production failure modes addressed:
 * 1) restoreCloudSession was fire-and-forget — race with bootstrap reconcile.
 * 2) Reconcile only read raw retailTransactions; Own RH VP often lives in bakiEvents.
 * 3) Stale local memberId on device rows filtered out before upload.
 */

import {
  fetchCloudAppData,
  pushCloudAppDataKeys,
  serializeCloudPayload,
} from "@/lib/cloud/cloud-app-data-service";
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import {
  loadAuthoritativeRetailTransactionsFromSnapshots,
  resolveAuthoritativeRetailTransactionsFromPayloads,
  resolveLocalEventsForOwnReconciliation,
  resolveLocalRowsForOwnReconciliation,
} from "@/lib/retail-house/authoritative-retail-transactions";
import { mergeBakiEventsById } from "@/lib/retail-house/downline-product-vp";
import {
  filterOutRetailTombstonedIds,
  readRetailTransactionDeletionTombstoneIds,
} from "@/lib/retail-house/retail-transaction-deletion-tombstones";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { EntityId } from "@/types";
import type { RetailTransaction } from "@/types/retail-transaction";

export { resolveLocalRowsForOwnReconciliation } from "@/lib/retail-house/authoritative-retail-transactions";

/** Exact runtime key used by RetailRepository — do not invent alternatives. */
export const RETAIL_TRANSACTIONS_STORAGE_KEY = STORAGE_KEYS.retailTransactions;
export const BAKI_EVENTS_STORAGE_KEY = STORAGE_KEYS.bakiEvents;

export type RetailReconcileStatus =
  | "success"
  | "no_local_data"
  | "already_synced"
  | "unauthorized"
  | "write_error"
  | "parse_failed"
  | "skipped";

export interface RetailTransactionsCloudPort {
  fetchRetailPayload: (memberId: EntityId) => Promise<unknown | null>;
  fetchBakiEventsPayload: (memberId: EntityId) => Promise<unknown | null>;
  upsertRetailPayload: (memberId: EntityId, transactions: RetailTransaction[]) => Promise<void>;
  upsertBakiEventsPayload: (memberId: EntityId, payload: unknown) => Promise<void>;
}

export interface RetailReconciliationDiagnostics {
  memberId: EntityId;
  localCount: number;
  cloudCount: number;
  mergedCount: number;
  localEventCount: number;
  uploaded: boolean;
  uploadedEvents: boolean;
  status: RetailReconcileStatus;
  reason?: string;
  claimedLegacyMemberIds?: boolean;
}

export interface RetailReconciliationResult {
  transactions: RetailTransaction[];
  diagnostics: RetailReconciliationDiagnostics;
}

function logRetail(
  event:
    | "retail_reconcile_invoked"
    | "retail_reconcile_local_loaded"
    | "retail_reconcile_cloud_loaded"
    | "retail_reconcile_write_attempt"
    | "retail_reconcile_write_success"
    | "retail_reconcile_write_failure",
  payload: Record<string, unknown> | RetailReconciliationDiagnostics,
): void {
  if (process.env.NODE_ENV === "test" && !event.endsWith("failure")) {
    return;
  }
  const logger = event.endsWith("failure") ? console.error : console.info;
  logger(`[retail_house] ${event}`, payload);
}

function parseTransactionArray(raw: unknown): RetailTransaction[] {
  if (raw == null) {
    return [];
  }
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isUsableRetailTransaction);
}

function parseBakiEventsArray(raw: unknown): BakiEvent[] {
  if (raw == null) {
    return [];
  }
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value as BakiEvent[];
}

function isUsableRetailTransaction(value: unknown): value is RetailTransaction {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Partial<RetailTransaction>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.memberId === "string" &&
    row.memberId.length > 0 &&
    typeof row.transactionTypeKey === "string" &&
    typeof row.transactionDate === "string" &&
    typeof row.amount === "number"
  );
}

function updatedAtMs(row: RetailTransaction): number {
  const value = row.updatedAt;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function updatedAtToken(row: RetailTransaction): string {
  const value = row.updatedAt;
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value ?? "");
}

function fingerprintOwnedTransactions(rows: readonly RetailTransaction[]): string {
  return [...rows]
    .map(
      (row) =>
        `${row.id}:${updatedAtToken(row)}:${row.amount}:${JSON.stringify(row.metadata ?? null)}`,
    )
    .sort()
    .join("|");
}

function fingerprintEvents(events: readonly BakiEvent[]): string {
  return [...events]
    .map((event) => `${event.id}:${String(event.updatedAt ?? "")}:${event.value}`)
    .sort()
    .join("|");
}

function claimAsOwner(
  row: RetailTransaction,
  ownerMemberId: EntityId,
): RetailTransaction {
  return {
    ...row,
    memberId: ownerMemberId,
    metadata: row.metadata ? { ...row.metadata } : row.metadata,
  };
}

function claimEventsAsOwner(
  events: readonly BakiEvent[],
  ownerMemberId: EntityId,
): BakiEvent[] {
  return events.map((event) => ({
    ...event,
    memberId: ownerMemberId,
    metadata: event.metadata ? { ...event.metadata } : event.metadata,
  }));
}

/**
 * Deterministic merge by stable transaction id.
 * Same id: newer updatedAt wins; ties prefer cloud.
 */
export function mergeRetailTransactionStores(input: {
  ownerMemberId: EntityId;
  local: readonly RetailTransaction[];
  cloud: readonly RetailTransaction[];
}): RetailTransaction[] {
  const byId = new Map<string, RetailTransaction>();

  const consider = (row: RetailTransaction, preferIncomingOnTie: boolean) => {
    const owned = claimAsOwner(row, input.ownerMemberId);
    const existing = byId.get(owned.id);
    if (!existing) {
      byId.set(owned.id, owned);
      return;
    }
    const existingMs = updatedAtMs(existing);
    const incomingMs = updatedAtMs(owned);
    if (incomingMs > existingMs) {
      byId.set(owned.id, owned);
      return;
    }
    if (incomingMs < existingMs) {
      return;
    }
    if (preferIncomingOnTie) {
      byId.set(owned.id, owned);
    }
  };

  for (const row of input.cloud) {
    consider(row, true);
  }
  for (const row of input.local) {
    consider(row, false);
  }

  return [...byId.values()];
}

export function createDefaultRetailTransactionsCloudPort(): RetailTransactionsCloudPort {
  return {
    async fetchRetailPayload(memberId) {
      const rows = await fetchCloudAppData(memberId);
      const row = rows.find((entry) => entry.dataKey === RETAIL_TRANSACTIONS_STORAGE_KEY);
      return row ? row.payload : null;
    },
    async fetchBakiEventsPayload(memberId) {
      const rows = await fetchCloudAppData(memberId);
      const row = rows.find((entry) => entry.dataKey === BAKI_EVENTS_STORAGE_KEY);
      return row ? row.payload : null;
    },
    async upsertRetailPayload(memberId, transactions) {
      await pushCloudAppDataKeys({
        memberId,
        entries: [
          {
            dataKey: RETAIL_TRANSACTIONS_STORAGE_KEY,
            rawValue: JSON.stringify(transactions),
          },
        ],
      });
    },
    async upsertBakiEventsPayload(memberId, payload) {
      await pushCloudAppDataKeys({
        memberId,
        entries: [
          {
            dataKey: BAKI_EVENTS_STORAGE_KEY,
            rawValue: typeof payload === "string" ? payload : JSON.stringify(payload),
          },
        ],
      });
    },
  };
}

function parseBakiEventsRaw(raw: string | null): BakiEvent[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BakiEvent[]) : [];
  } catch {
    return [];
  }
}

function serializePayload(raw: unknown | null | undefined): unknown {
  if (raw === null || raw === undefined) {
    return [];
  }
  if (typeof raw === "string") {
    return raw;
  }
  return serializeCloudPayload(raw);
}

/**
 * Merge-first reconciliation for authenticated member's OWN retail data.
 * Reads authoritative local (bakiEvents ∪ retailTransactions) — never raw legacy only.
 * Never writes [] over non-empty local. Never accepts a foreign memberId target.
 */
export async function reconcileOwnRetailTransactions(input: {
  storage: StorageAdapter;
  /** Authenticated member — the only allowed cloud write target. */
  memberId: EntityId;
  /** @deprecated Use cloudRetailPayload */
  cloudPayload?: unknown | null;
  cloudRetailPayload?: unknown | null;
  cloudBakiEventsPayload?: unknown | null;
  /** Snapshot taken BEFORE any cloud hydration could overwrite local. */
  localRawSnapshot?: string | null;
  localRetailRawSnapshot?: string | null;
  localBakiEventsRawSnapshot?: string | null;
  cloudPort?: RetailTransactionsCloudPort;
}): Promise<RetailReconciliationResult> {
  const memberId = input.memberId;

  logRetail("retail_reconcile_invoked", {
    memberId,
    storageKeys: [RETAIL_TRANSACTIONS_STORAGE_KEY, BAKI_EVENTS_STORAGE_KEY],
  });

  if (!isCloudDatabaseMemberId(memberId)) {
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: 0,
      cloudCount: 0,
      mergedCount: 0,
      localEventCount: 0,
      uploaded: false,
      uploadedEvents: false,
      status: "unauthorized",
      reason: "non_cloud_member_id",
    };
    logRetail("retail_reconcile_write_failure", diagnostics);
    return { transactions: [], diagnostics };
  }

  const retailRawSnapshot =
    input.localRetailRawSnapshot ??
    input.localRawSnapshot ??
    input.storage.getItem(RETAIL_TRANSACTIONS_STORAGE_KEY);
  const bakiEventsRawSnapshot =
    input.localBakiEventsRawSnapshot ??
    input.storage.getItem(BAKI_EVENTS_STORAGE_KEY);

  const localAuthoritative = loadAuthoritativeRetailTransactionsFromSnapshots({
    ownerMemberId: memberId,
    bakiEventsRaw: bakiEventsRawSnapshot,
    retailTransactionsRaw: retailRawSnapshot,
    tombstoneIds: readRetailTransactionDeletionTombstoneIds(input.storage),
  });

  const tombstoneIds = readRetailTransactionDeletionTombstoneIds(input.storage);
  const legacyAll = filterOutRetailTombstonedIds(
    parseTransactionArray(retailRawSnapshot),
    tombstoneIds,
  );
  const { localOthers, claimedLegacyMemberIds } = resolveLocalRowsForOwnReconciliation({
    ownerMemberId: memberId,
    localAll: legacyAll,
  });

  const localOwnedEvents = filterOutRetailTombstonedIds(
    resolveLocalEventsForOwnReconciliation(
      parseBakiEventsRaw(bakiEventsRawSnapshot),
      memberId,
    ),
    tombstoneIds,
  );
  const localOwned = localAuthoritative.transactions;

  logRetail("retail_reconcile_local_loaded", {
    memberId,
    localCount: localOwned.length,
    localEventCount: localOwnedEvents.length,
    rawLegacyCount: legacyAll.length,
    sourceSelected: localAuthoritative.diagnostics.sourceSelected,
    claimedLegacyMemberIds,
  });

  if (localOwned.length === 0 && tombstoneIds.size === 0) {
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: 0,
      cloudCount: 0,
      mergedCount: 0,
      localEventCount: localOwnedEvents.length,
      uploaded: false,
      uploadedEvents: false,
      status: "no_local_data",
      reason: "empty_authoritative_local",
      claimedLegacyMemberIds,
    };
    return { transactions: [], diagnostics };
  }

  const port = input.cloudPort ?? createDefaultRetailTransactionsCloudPort();

  const cloudRetailPayloadInput =
    input.cloudRetailPayload !== undefined
      ? input.cloudRetailPayload
      : input.cloudPayload;
  let cloudRetailPayload: unknown | null;
  let cloudBakiEventsPayload: unknown | null;
  try {
    cloudRetailPayload =
      cloudRetailPayloadInput !== undefined
        ? cloudRetailPayloadInput
        : await port.fetchRetailPayload(memberId);
    cloudBakiEventsPayload =
      input.cloudBakiEventsPayload !== undefined
        ? input.cloudBakiEventsPayload
        : await port.fetchBakiEventsPayload(memberId);
  } catch (error) {
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: localOwned.length,
      cloudCount: 0,
      mergedCount: localOwned.length,
      localEventCount: localOwnedEvents.length,
      uploaded: false,
      uploadedEvents: false,
      status: "write_error",
      reason: "cloud_fetch_failed",
      claimedLegacyMemberIds,
    };
    logRetail("retail_reconcile_write_failure", { ...diagnostics, error });
    return { transactions: localOwned, diagnostics };
  }

  const cloudEvents = filterOutRetailTombstonedIds(
    parseBakiEventsArray(serializePayload(cloudBakiEventsPayload)),
    tombstoneIds,
  );
  const cloudAuthoritative = resolveAuthoritativeRetailTransactionsFromPayloads({
    ownerMemberId: memberId,
    events: cloudEvents,
    legacyTransactions: filterOutRetailTombstonedIds(
      parseTransactionArray(serializePayload(cloudRetailPayload)),
      tombstoneIds,
    ),
  });
  const cloudOwned = cloudAuthoritative.transactions;

  logRetail("retail_reconcile_cloud_loaded", {
    memberId,
    cloudCount: cloudOwned.length,
    cloudEventCount: cloudEvents.length,
    cloudMissing:
      (cloudRetailPayload === null || cloudRetailPayload === undefined) &&
      (cloudBakiEventsPayload === null || cloudBakiEventsPayload === undefined),
  });

  const mergedOwned = mergeRetailTransactionStores({
    ownerMemberId: memberId,
    local: localOwned,
    cloud: cloudOwned,
  });

  // Hard gate: never allow empty cloud to erase non-empty local.
  if (localOwned.length > 0 && mergedOwned.length === 0) {
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: localOwned.length,
      cloudCount: cloudOwned.length,
      mergedCount: localOwned.length,
      localEventCount: localOwnedEvents.length,
      uploaded: false,
      uploadedEvents: false,
      status: "write_error",
      reason: "refused_empty_merge",
      claimedLegacyMemberIds,
    };
    logRetail("retail_reconcile_write_failure", diagnostics);
    return { transactions: localOwned, diagnostics };
  }

  const localNext = [...localOthers, ...mergedOwned];
  const previousLocalRaw = input.storage.getItem(RETAIL_TRANSACTIONS_STORAGE_KEY);
  const nextLocalRaw = JSON.stringify(localNext);
  if (previousLocalRaw !== nextLocalRaw) {
    input.storage.setItem(RETAIL_TRANSACTIONS_STORAGE_KEY, nextLocalRaw);
  }

  const mergedEvents = filterOutRetailTombstonedIds(
    mergeBakiEventsById(
      cloudEvents,
      claimEventsAsOwner(localOwnedEvents, memberId),
    ),
    tombstoneIds,
  );
  // Keep local events aligned with merged authoritative set (minus tombstones).
  const previousEventsRaw = input.storage.getItem(BAKI_EVENTS_STORAGE_KEY);
  const nonTransactionEvents = parseBakiEventsRaw(previousEventsRaw).filter(
    (event) => event.eventCategory !== "transaction",
  );
  const nextEventsRaw = JSON.stringify([...nonTransactionEvents, ...mergedEvents]);
  if (previousEventsRaw !== nextEventsRaw) {
    input.storage.setItem(BAKI_EVENTS_STORAGE_KEY, nextEventsRaw);
  }

  const cloudRetailMissing =
    cloudRetailPayload === null || cloudRetailPayload === undefined;
  const cloudHasTombstonedRetail =
    tombstoneIds.size > 0 &&
    parseTransactionArray(serializePayload(cloudRetailPayload)).some((row) =>
      tombstoneIds.has(row.id),
    );
  const needsRetailUpload =
    cloudHasTombstonedRetail ||
    (mergedOwned.length > 0 &&
      (cloudRetailMissing ||
        fingerprintOwnedTransactions(cloudOwned) !==
          fingerprintOwnedTransactions(mergedOwned)));

  const cloudEventsMissing =
    cloudBakiEventsPayload === null || cloudBakiEventsPayload === undefined;
  const cloudHasTombstonedEvents =
    tombstoneIds.size > 0 &&
    parseBakiEventsArray(serializePayload(cloudBakiEventsPayload)).some((row) =>
      tombstoneIds.has(row.id),
    );
  const needsEventsUpload =
    cloudHasTombstonedEvents ||
    ((localOwnedEvents.length > 0 || mergedEvents.length > 0) &&
      (cloudEventsMissing ||
        fingerprintEvents(cloudEvents) !== fingerprintEvents(mergedEvents)));

  if (!needsRetailUpload && !needsEventsUpload) {
    return {
      transactions: mergedOwned,
      diagnostics: {
        memberId,
        localCount: localOwned.length,
        cloudCount: cloudOwned.length,
        mergedCount: mergedOwned.length,
        localEventCount: localOwnedEvents.length,
        uploaded: false,
        uploadedEvents: false,
        status: "success",
        reason: "already_in_sync",
        claimedLegacyMemberIds,
      },
    };
  }

  logRetail("retail_reconcile_write_attempt", {
    memberId,
    localCount: localOwned.length,
    cloudCount: cloudOwned.length,
    mergedCount: mergedOwned.length,
    needsRetailUpload,
    needsEventsUpload,
  });

  let uploaded = false;
  let uploadedEvents = false;

  try {
    if (needsRetailUpload) {
      await port.upsertRetailPayload(memberId, mergedOwned);
      uploaded = true;
    }
    if (needsEventsUpload) {
      await port.upsertBakiEventsPayload(memberId, mergedEvents);
      uploadedEvents = true;
    }
  } catch (error) {
    if (localOwned.length > 0) {
      const current = parseTransactionArray(
        input.storage.getItem(RETAIL_TRANSACTIONS_STORAGE_KEY),
      );
      const currentOwned = current.filter((row) => row.memberId === memberId);
      if (currentOwned.length === 0) {
        input.storage.setItem(
          RETAIL_TRANSACTIONS_STORAGE_KEY,
          JSON.stringify([...localOthers, ...localOwned]),
        );
      }
    }
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: localOwned.length,
      cloudCount: cloudOwned.length,
      mergedCount: mergedOwned.length,
      localEventCount: localOwnedEvents.length,
      uploaded,
      uploadedEvents,
      status: "write_error",
      reason: "cloud_upsert_failed",
      claimedLegacyMemberIds,
    };
    logRetail("retail_reconcile_write_failure", { ...diagnostics, error });
    return { transactions: mergedOwned, diagnostics };
  }

  const diagnostics: RetailReconciliationDiagnostics = {
    memberId,
    localCount: localOwned.length,
    cloudCount: cloudOwned.length,
    mergedCount: mergedOwned.length,
    localEventCount: localOwnedEvents.length,
    uploaded,
    uploadedEvents,
    status: "success",
    claimedLegacyMemberIds,
  };
  logRetail("retail_reconcile_write_success", diagnostics);
  return { transactions: mergedOwned, diagnostics };
}

/**
 * Authenticated app bootstrap entry — in-flight deduped per member.
 * Safe to call from multiple bootstrap paths; only one network cycle runs.
 */
const retailReconcileInflight = new Map<string, Promise<RetailReconciliationResult>>();

export function __resetRetailReconcileInflightForTests(): void {
  retailReconcileInflight.clear();
}

export function getRetailReconcileInflightCountForTests(): number {
  return retailReconcileInflight.size;
}

export async function ensureOwnRetailTransactionsReconciled(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  cloudPort?: RetailTransactionsCloudPort;
}): Promise<RetailReconciliationResult> {
  const existing = retailReconcileInflight.get(input.memberId);
  if (existing) {
    return existing;
  }

  const localRetailRawSnapshot = input.storage.getItem(RETAIL_TRANSACTIONS_STORAGE_KEY);
  const localBakiEventsRawSnapshot = input.storage.getItem(BAKI_EVENTS_STORAGE_KEY);
  const pending = reconcileOwnRetailTransactions({
    storage: input.storage,
    memberId: input.memberId,
    localRetailRawSnapshot,
    localBakiEventsRawSnapshot,
    cloudPort: input.cloudPort,
  }).finally(() => {
    retailReconcileInflight.delete(input.memberId);
  });
  retailReconcileInflight.set(input.memberId, pending);
  return pending;
}

/** Alias used by login sync — same merge-first path. */
export async function reconcileRetailTransactionsDuringLoginSync(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  cloudPayload?: unknown | null;
  cloudRetailPayload?: unknown | null;
  cloudBakiEventsPayload?: unknown | null;
  localRawSnapshot?: string | null;
  localRetailRawSnapshot?: string | null;
  localBakiEventsRawSnapshot?: string | null;
  cloudPort?: RetailTransactionsCloudPort;
}): Promise<RetailReconciliationResult> {
  return reconcileOwnRetailTransactions({
    storage: input.storage,
    memberId: input.memberId,
    cloudPayload: input.cloudPayload,
    cloudRetailPayload: input.cloudRetailPayload ?? input.cloudPayload,
    cloudBakiEventsPayload: input.cloudBakiEventsPayload,
    localRawSnapshot: input.localRawSnapshot,
    localRetailRawSnapshot: input.localRetailRawSnapshot ?? input.localRawSnapshot,
    localBakiEventsRawSnapshot: input.localBakiEventsRawSnapshot,
    cloudPort: input.cloudPort,
  });
}
