/**
 * Own-data reconciliation: local legacy `baki-go:retail-transactions`
 * → member_app_data (authenticated member only).
 *
 * Production root cause: zero cloud rows for this key. Historical data lived
 * only on device localStorage. Adding the key to SYNCABLE_STORAGE_KEYS alone
 * did not upload Production history because:
 * 1) Production never ran that build (not promoted)
 * 2) Debounced sync only fires on setItem — untouched historical keys never push
 * 3) Blind cloud hydration can overwrite local with [] when an empty cloud row exists
 *
 * This module is merge-first and never replaces non-empty local with empty cloud.
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
  status: "success" | "failure" | "skipped";
  reason?: string;
}

export interface RetailReconciliationResult {
  transactions: RetailTransaction[];
  diagnostics: RetailReconciliationDiagnostics;
}

function logReconciliation(
  event: "retail_reconciliation_start" | "retail_reconciliation_success" | "retail_reconciliation_failure",
  diagnostics: Partial<RetailReconciliationDiagnostics> & { memberId: EntityId },
): void {
  if (process.env.NODE_ENV === "test" && event !== "retail_reconciliation_failure") {
    return;
  }
  const logger = event === "retail_reconciliation_failure" ? console.error : console.info;
  logger(`[retail_house] ${event}`, {
    memberId: diagnostics.memberId,
    localCount: diagnostics.localCount,
    cloudCount: diagnostics.cloudCount,
    mergedCount: diagnostics.mergedCount,
    uploaded: diagnostics.uploaded,
    status: diagnostics.status,
    reason: diagnostics.reason,
  });
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

/**
 * Deterministic merge by stable transaction id.
 * Same id: newer updatedAt wins; ties prefer `preferred` (cloud when merging local∪cloud).
 */
export function mergeRetailTransactionStores(input: {
  ownerMemberId: EntityId;
  local: readonly RetailTransaction[];
  cloud: readonly RetailTransaction[];
}): RetailTransaction[] {
  const byId = new Map<string, RetailTransaction>();

  const consider = (row: RetailTransaction, preferIncomingOnTie: boolean) => {
    if (row.memberId !== input.ownerMemberId) {
      return;
    }
    const owned: RetailTransaction = {
      ...row,
      memberId: input.ownerMemberId,
      metadata: row.metadata ? { ...row.metadata } : row.metadata,
    };
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

  // Cloud first (tie → keep cloud), then local (newer local wins).
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
      const row = rows.find((entry) => entry.dataKey === STORAGE_KEYS.retailTransactions);
      return row ? row.payload : null;
    },
    async upsertPayload(memberId, transactions) {
      await pushCloudAppDataKeys({
        memberId,
        entries: [
          {
            dataKey: STORAGE_KEYS.retailTransactions,
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

  if (!isCloudDatabaseMemberId(memberId)) {
    return {
      transactions: [],
      diagnostics: {
        memberId,
        localCount: 0,
        cloudCount: 0,
        mergedCount: 0,
        uploaded: false,
        status: "skipped",
        reason: "non_cloud_member_id",
      },
    };
  }

  const localRaw =
    input.localRawSnapshot !== undefined
      ? input.localRawSnapshot
      : input.storage.getItem(STORAGE_KEYS.retailTransactions);
  const localAll = parseTransactionArray(localRaw);
  const localOwned = localAll.filter((row) => row.memberId === memberId);
  const localOthers = localAll.filter((row) => row.memberId !== memberId);

  logReconciliation("retail_reconciliation_start", {
    memberId,
    localCount: localOwned.length,
    uploaded: false,
    status: "success",
  });

  const port = input.cloudPort ?? createDefaultRetailTransactionsCloudPort();

  let cloudPayload: unknown | null;
  try {
    cloudPayload =
      input.cloudPayload !== undefined ? input.cloudPayload : await port.fetchPayload(memberId);
  } catch (error) {
    // Failure safety: keep local intact.
    const diagnostics: RetailReconciliationDiagnostics = {
      memberId,
      localCount: localOwned.length,
      cloudCount: 0,
      mergedCount: localOwned.length,
      uploaded: false,
      status: "failure",
      reason: "cloud_fetch_failed",
    };
    logReconciliation("retail_reconciliation_failure", diagnostics);
    console.error("[retail_house] retail_reconciliation_failure", { memberId, error });
    return { transactions: localOwned, diagnostics };
  }

  const cloudOwned = parseTransactionArray(
    cloudPayload === null || cloudPayload === undefined
      ? []
      : typeof cloudPayload === "string"
        ? cloudPayload
        : serializeCloudPayload(cloudPayload),
  ).filter((row) => row.memberId === memberId);

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
      status: "failure",
      reason: "refused_empty_merge",
    };
    logReconciliation("retail_reconciliation_failure", diagnostics);
    return { transactions: localOwned, diagnostics };
  }

  const localNext = [...localOthers, ...mergedOwned];
  const previousLocalRaw = input.storage.getItem(STORAGE_KEYS.retailTransactions);
  const nextLocalRaw = JSON.stringify(localNext);

  // Persist merged local without going through empty overwrite.
  if (previousLocalRaw !== nextLocalRaw) {
    input.storage.setItem(STORAGE_KEYS.retailTransactions, nextLocalRaw);
  } else if (localOwned.length > 0 && !previousLocalRaw) {
    input.storage.setItem(STORAGE_KEYS.retailTransactions, nextLocalRaw);
  }

  let uploaded = false;
  try {
    const cloudMissing = cloudPayload === null || cloudPayload === undefined;
    const needsUpload =
      mergedOwned.length > 0 &&
      (cloudMissing ||
        fingerprintOwnedTransactions(cloudOwned) !== fingerprintOwnedTransactions(mergedOwned));

    if (needsUpload) {
      await port.upsertPayload(memberId, mergedOwned);
      uploaded = true;
    }
  } catch (error) {
    // Restore local snapshot if we somehow emptied — should not happen.
    if (localOwned.length > 0) {
      const current = parseTransactionArray(input.storage.getItem(STORAGE_KEYS.retailTransactions));
      const currentOwned = current.filter((row) => row.memberId === memberId);
      if (currentOwned.length === 0) {
        input.storage.setItem(
          STORAGE_KEYS.retailTransactions,
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
      status: "failure",
      reason: "cloud_upsert_failed",
    };
    logReconciliation("retail_reconciliation_failure", diagnostics);
    console.error("[retail_house] retail_reconciliation_failure", { memberId, error });
    return { transactions: mergedOwned, diagnostics };
  }

  const diagnostics: RetailReconciliationDiagnostics = {
    memberId,
    localCount: localOwned.length,
    cloudCount: cloudOwned.length,
    mergedCount: mergedOwned.length,
    uploaded,
    status: "success",
  };
  logReconciliation("retail_reconciliation_success", diagnostics);
  return { transactions: mergedOwned, diagnostics };
}

/**
 * Guard used by login sync: apply cloud retail payload only via merge reconciliation.
 * Never call storage.setItem(retailTransactions, "[]") from empty cloud.
 */
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
