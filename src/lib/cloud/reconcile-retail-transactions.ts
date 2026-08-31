/**
 * Own-data reconciliation: local `baki-go:retail-transactions`
 * → authenticated member's member_app_data.
 *
 * SYNC ROOT CAUSE (Production still 0 rows after prior patch):
 * 1) restoreCloudSession used awaitSync:false — sync was fire-and-forget and
 *    easy to miss / fail silently on restored sessions (most real usage).
 * 2) Reconciliation filtered local rows by exact memberId === auth UUID.
 *    Legacy device rows often carry a stale local memberId → localCount 0 →
 *    no upsert even when localStorage has the history Own RH reads.
 * 3) Debounced SyncingStorageAdapter push never fires for untouched keys.
 *
 * This module: merge-first, claim device legacy to auth memberId, awaited
 * upsert, never wipe non-empty local with empty cloud.
 */

import {
  fetchCloudAppData,
  pushCloudAppDataKeys,
  serializeCloudPayload,
} from "@/lib/cloud/cloud-app-data-service";
import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import type { RetailTransaction } from "@/types/retail-transaction";

/** Exact runtime key used by RetailRepository — do not invent alternatives. */
export const RETAIL_TRANSACTIONS_STORAGE_KEY = STORAGE_KEYS.retailTransactions;

export type RetailReconcileStatus =
  | "success"
  | "no_local_data"
  | "unauthorized"
  | "write_error"
  | "skipped";

export interface RetailTransactionsCloudPort {
  /** null = row missing in member_app_data; otherwise raw payload. */
  fetchPayload: (memberId: EntityId) => Promise<unknown | null>;
  upsertPayload: (memberId: EntityId, transactions: RetailTransaction[]) => Promise<void>;
}

export interface RetailReconciliationDiagnostics {
  memberId: EntityId;
  localCount: number;
  cloudCount: number;
  mergedCount: number;
  uploaded: boolean;
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

/**
 * Resolve which local rows belong in the authenticated member's cloud blob.
 * If none match auth UUID but local history exists, claim device legacy rows
 * (stale local memberId — Production failure mode).
 */
export function resolveLocalRowsForOwnReconciliation(input: {
  ownerMemberId: EntityId;
  localAll: readonly RetailTransaction[];
}): {
  localOwned: RetailTransaction[];
  localOthers: RetailTransaction[];
  claimedLegacyMemberIds: boolean;
} {
  const matching = input.localAll.filter((row) => row.memberId === input.ownerMemberId);
  const nonMatching = input.localAll.filter((row) => row.memberId !== input.ownerMemberId);

  if (matching.length > 0) {
    return {
      localOwned: matching.map((row) => claimAsOwner(row, input.ownerMemberId)),
      localOthers: nonMatching,
      claimedLegacyMemberIds: false,
    };
  }

  if (nonMatching.length > 0) {
    return {
      localOwned: nonMatching.map((row) => claimAsOwner(row, input.ownerMemberId)),
      localOthers: [],
      claimedLegacyMemberIds: true,
    };
  }

  return { localOwned: [], localOthers: [], claimedLegacyMemberIds: false };
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
    async fetchPayload(memberId) {
      const rows = await fetchCloudAppData(memberId);
      const row = rows.find((entry) => entry.dataKey === RETAIL_TRANSACTIONS_STORAGE_KEY);
      return row ? row.payload : null;
    },
    async upsertPayload(memberId, transactions) {
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
  };
}

/**
 * Merge-first reconciliation for authenticated member's OWN retailTransactions.
 * Never writes [] over non-empty local. Never accepts a foreign memberId target.
 */
export async function reconcileOwnRetailTransactions(input: {
  storage: StorageAdapter;
  /** Authenticated member — the only allowed cloud write target. */
  memberId: EntityId;
  /**
   * Optional pre-fetched cloud payload from login sync.
   * `undefined` → fetch via port; `null` → row missing; otherwise use payload.
   */
  cloudPayload?: unknown | null;
  /** Snapshot taken BEFORE any cloud hydration could overwrite local. */
  localRawSnapshot?: string | null;
  cloudPort?: RetailTransactionsCloudPort;
}): Promise<RetailReconciliationResult> {
  const memberId = input.memberId;

  logRetail("retail_reconcile_invoked", {
    memberId,
    storageKey: RETAIL_TRANSACTIONS_STORAGE_KEY,
  });

  if (!isCloudDatabaseMemberId(memberId)) {
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: 0,
      cloudCount: 0,
      mergedCount: 0,
      uploaded: false,
      status: "unauthorized",
      reason: "non_cloud_member_id",
    };
    logRetail("retail_reconcile_write_failure", diagnostics);
    return { transactions: [], diagnostics };
  }

  const localRaw =
    input.localRawSnapshot !== undefined
      ? input.localRawSnapshot
      : input.storage.getItem(RETAIL_TRANSACTIONS_STORAGE_KEY);
  const localAll = parseTransactionArray(localRaw);
  const { localOwned, localOthers, claimedLegacyMemberIds } =
    resolveLocalRowsForOwnReconciliation({
      ownerMemberId: memberId,
      localAll,
    });

  logRetail("retail_reconcile_local_loaded", {
    memberId,
    localCount: localOwned.length,
    rawLocalCount: localAll.length,
    claimedLegacyMemberIds,
  });

  if (localOwned.length === 0) {
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: 0,
      cloudCount: 0,
      mergedCount: 0,
      uploaded: false,
      status: "no_local_data",
      reason: "empty_local",
      claimedLegacyMemberIds,
    };
    return { transactions: [], diagnostics };
  }

  const port = input.cloudPort ?? createDefaultRetailTransactionsCloudPort();

  let cloudPayload: unknown | null;
  try {
    cloudPayload =
      input.cloudPayload !== undefined ? input.cloudPayload : await port.fetchPayload(memberId);
  } catch (error) {
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: localOwned.length,
      cloudCount: 0,
      mergedCount: localOwned.length,
      uploaded: false,
      status: "write_error",
      reason: "cloud_fetch_failed",
      claimedLegacyMemberIds,
    };
    logRetail("retail_reconcile_write_failure", { ...diagnostics, error });
    return { transactions: localOwned, diagnostics };
  }

  const cloudOwned = parseTransactionArray(
    cloudPayload === null || cloudPayload === undefined
      ? []
      : typeof cloudPayload === "string"
        ? cloudPayload
        : serializeCloudPayload(cloudPayload),
  ).map((row) => claimAsOwner(row, memberId));

  logRetail("retail_reconcile_cloud_loaded", {
    memberId,
    cloudCount: cloudOwned.length,
    cloudMissing: cloudPayload === null || cloudPayload === undefined,
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
      uploaded: false,
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

  const cloudMissing = cloudPayload === null || cloudPayload === undefined;
  const needsUpload =
    mergedOwned.length > 0 &&
    (cloudMissing ||
      fingerprintOwnedTransactions(cloudOwned) !== fingerprintOwnedTransactions(mergedOwned));

  if (!needsUpload) {
    return {
      transactions: mergedOwned,
      diagnostics: {
        memberId,
        localCount: localOwned.length,
        cloudCount: cloudOwned.length,
        mergedCount: mergedOwned.length,
        uploaded: false,
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
  });

  try {
    await port.upsertPayload(memberId, mergedOwned);
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
      uploaded: false,
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
    uploaded: true,
    status: "success",
    claimedLegacyMemberIds,
  };
  logRetail("retail_reconcile_write_success", diagnostics);
  return { transactions: mergedOwned, diagnostics };
}

/**
 * Authenticated app bootstrap entry — must be awaited.
 * Safe to call on every restore / login / PWA launch.
 */
export async function ensureOwnRetailTransactionsReconciled(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  cloudPort?: RetailTransactionsCloudPort;
}): Promise<RetailReconciliationResult> {
  const localRawSnapshot = input.storage.getItem(RETAIL_TRANSACTIONS_STORAGE_KEY);
  return reconcileOwnRetailTransactions({
    storage: input.storage,
    memberId: input.memberId,
    localRawSnapshot,
    cloudPort: input.cloudPort,
  });
}

/** Alias used by login sync — same merge-first path. */
export async function reconcileRetailTransactionsDuringLoginSync(input: {
  storage: StorageAdapter;
  memberId: EntityId;
  cloudPayload: unknown | null;
  localRawSnapshot: string | null;
  cloudPort?: RetailTransactionsCloudPort;
}): Promise<RetailReconciliationResult> {
  return reconcileOwnRetailTransactions({
    storage: input.storage,
    memberId: input.memberId,
    cloudPayload: input.cloudPayload,
    localRawSnapshot: input.localRawSnapshot,
    cloudPort: input.cloudPort,
  });
}
