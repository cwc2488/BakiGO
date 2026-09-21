import { todayISODate } from "@/lib/config/app-config";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";

/** 我的名單 retired — empty snapshot keeps metrics/learning callers compiling. */
export function buildRetailPipelineSnapshot(
  ownerMemberId: EntityId,
  _storage: StorageAdapter,
): RetailPipelineSnapshot {
  return {
    ownerMemberId,
    referenceDate: todayISODate(),
    columns: [],
    totalLeads: 0,
  };
}
