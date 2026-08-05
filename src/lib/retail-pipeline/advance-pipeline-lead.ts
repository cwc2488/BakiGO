import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import { processEventForCurrentMember } from "@/lib/event-center/process-event";
import {
  getNextPipelineStageKey,
  getPipelineStageDefinition,
} from "@/lib/retail-pipeline/pipeline-stages";
import { createRetailLeadRepository } from "@/lib/repositories/retail-lead-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { recalculateMemberMetrics } from "@/lib/services/recalculate-member-metrics";
import type { RetailPipelineLead } from "@/types/retail-pipeline";
import type { EntityId } from "@/types";

function buildPipelineEventMetadata(
  lead: RetailPipelineLead,
  targetStageKey: ReturnType<typeof getNextPipelineStageKey>,
) {
  const base = {
    leadId: lead.id,
    pipelineStage: targetStageKey,
    customerName: lead.displayName,
  };

  const stage = targetStageKey ? getPipelineStageDefinition(targetStageKey) : null;
  if (stage?.entryEventCategory === "transaction") {
    return {
      ...base,
      currencyCode: stage.entryEventTypeKey?.includes("_vp") ? "VP" : "TWD",
      note: lead.note,
    };
  }

  if (lead.note) {
    return { ...base, note: lead.note };
  }

  return base;
}

export function advancePipelineLead(
  leadId: EntityId,
  storage: StorageAdapter,
): { lead: RetailPipelineLead; metrics: MemberComputedMetrics } {
  const repository = createRetailLeadRepository(storage);
  const lead = repository.getById(leadId);
  if (!lead) {
    throw new Error("找不到名單");
  }

  const ownerMemberId = resolveAuthenticatedMemberId(storage);
  if (lead.ownerMemberId !== ownerMemberId) {
    throw new Error("無權限操作此名單");
  }

  const nextStageKey = getNextPipelineStageKey(lead.stageKey);
  if (!nextStageKey) {
    throw new Error("此名單已在最終階段");
  }

  const nextStage = getPipelineStageDefinition(nextStageKey);

  let metrics: MemberComputedMetrics;
  if (nextStage.entryEventTypeKey && nextStage.entryEventCategory) {
    const eventDate = todayISODate();
    const metadata = buildPipelineEventMetadata(lead, nextStageKey);

    metrics = processEventForCurrentMember(
      {
        eventTypeKey: nextStage.entryEventTypeKey,
        eventCategory: nextStage.entryEventCategory,
        eventDate,
        value: nextStage.entryEventCategory === "transaction" ? 1 : undefined,
        retailHouseKey:
          nextStage.entryEventCategory === "transaction"
            ? APP_IDS.defaultRetailHouseKey
            : undefined,
        metadata,
      },
      storage,
    );
  } else {
    metrics = recalculateMemberMetrics(
      { memberId: ownerMemberId, referenceDate: todayISODate() },
      storage,
    );
  }

  const updatedLead = repository.updateStage(leadId, nextStageKey);
  return { lead: updatedLead, metrics };
}

export function createPipelineLead(
  displayName: string,
  storage: StorageAdapter,
): RetailPipelineLead {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new Error("請輸入姓名");
  }

  return createRetailLeadRepository(storage).create({
    organizationId: APP_IDS.organizationId,
    ownerMemberId: resolveAuthenticatedMemberId(storage),
    displayName: trimmed,
  });
}

export function updatePipelineLeadScheduledDate(
  leadId: EntityId,
  scheduledDate: string | undefined,
  storage: StorageAdapter,
): RetailPipelineLead {
  const repository = createRetailLeadRepository(storage);
  const lead = repository.getById(leadId);
  if (!lead) {
    throw new Error("找不到名單");
  }

  const ownerMemberId = resolveAuthenticatedMemberId(storage);
  if (lead.ownerMemberId !== ownerMemberId) {
    throw new Error("無權限操作此名單");
  }

  return repository.updateScheduledDate(leadId, scheduledDate?.trim() || undefined);
}
