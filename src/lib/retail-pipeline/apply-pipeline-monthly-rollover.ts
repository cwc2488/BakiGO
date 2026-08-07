import { createRetailLeadRepository } from "@/lib/repositories/retail-lead-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { ISODateString, YearMonth } from "@/types";
import type { RetailPipelineStageKey } from "@/types/retail-pipeline";

const AUTO_ROLLOVER_TARGETS: Partial<Record<RetailPipelineStageKey, RetailPipelineStageKey>> = {
  new_customer: "returning_customer",
  new_member: "returning_member",
};

function toYearMonth(date: ISODateString): YearMonth {
  return date.slice(0, 7) as YearMonth;
}

/**
 * At month boundary:
 * - 本月新客 → 舊客（自動）
 * - 本月新會員 → 舊會員（自動）
 *
 * 舊客 → 會員 不在此處理，需夥伴手動推進。
 */
export function applyPipelineMonthlyRollover(
  storage: StorageAdapter,
  referenceDate: ISODateString,
): number {
  const currentYearMonth = toYearMonth(referenceDate);
  const repository = createRetailLeadRepository(storage);
  let rolledCount = 0;

  for (const lead of repository.getAll()) {
    const targetStage = AUTO_ROLLOVER_TARGETS[lead.stageKey];
    if (!targetStage) {
      continue;
    }

    const stageYearMonth = toYearMonth(lead.stageUpdatedAt);
    if (stageYearMonth >= currentYearMonth) {
      continue;
    }

    repository.updateStage(lead.id, targetStage);
    rolledCount += 1;
  }

  return rolledCount;
}
