import { todayISODate } from "@/lib/config/app-config";
import {
  getNextPipelineStageKey,
  getPipelineStageDefinition,
  RETAIL_PIPELINE_STAGES,
} from "@/lib/retail-pipeline/pipeline-stages";
import { createRetailLeadRepository } from "@/lib/repositories/retail-lead-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type {
  RetailPipelineColumnView,
  RetailPipelineLead,
  RetailPipelineLeadView,
  RetailPipelineSnapshot,
} from "@/types/retail-pipeline";
import type { EntityId } from "@/types";

function toLeadView(lead: RetailPipelineLead): RetailPipelineLeadView {
  const stage = getPipelineStageDefinition(lead.stageKey);
  const nextStageKey = getNextPipelineStageKey(lead.stageKey);

  return {
    leadId: lead.id,
    displayName: lead.displayName,
    stageKey: lead.stageKey,
    stageTitle: stage.title,
    nextStepLabel: stage.nextStepLabel,
    canAdvance: nextStageKey !== null,
    scheduledDate: lead.scheduledDate,
    region: lead.region,
  };
}

export function buildRetailPipelineSnapshot(
  ownerMemberId: EntityId,
  storage: StorageAdapter,
): RetailPipelineSnapshot {
  const leads = createRetailLeadRepository(storage)
    .getByOwner(ownerMemberId)
    .map(toLeadView);

  const columns: RetailPipelineColumnView[] = RETAIL_PIPELINE_STAGES.map((stage) => {
    const stageLeads = leads
      .filter((lead) => lead.stageKey === stage.key)
      .sort((left, right) => {
        if (left.scheduledDate && right.scheduledDate) {
          return left.scheduledDate.localeCompare(right.scheduledDate);
        }
        if (left.scheduledDate) {
          return -1;
        }
        if (right.scheduledDate) {
          return 1;
        }
        return left.displayName.localeCompare(right.displayName, "zh-Hant");
      });
    return {
      stageKey: stage.key,
      title: stage.title,
      count: stageLeads.length,
      leads: stageLeads,
      isDropTarget: false,
    };
  });

  return {
    ownerMemberId,
    referenceDate: todayISODate(),
    columns,
    totalLeads: leads.length,
  };
}

export function canDropLeadOnStage(
  lead: RetailPipelineLeadView,
  targetStageKey: RetailPipelineLeadView["stageKey"],
): boolean {
  const nextStageKey = getNextPipelineStageKey(lead.stageKey);
  return nextStageKey === targetStageKey;
}

export function withDropTargets(
  snapshot: RetailPipelineSnapshot,
  draggedLeadId: string | null,
): RetailPipelineSnapshot {
  if (!draggedLeadId) {
    return snapshot;
  }

  const draggedLead = snapshot.columns
    .flatMap((column) => column.leads)
    .find((lead) => lead.leadId === draggedLeadId);

  if (!draggedLead) {
    return snapshot;
  }

  return {
    ...snapshot,
    columns: snapshot.columns.map((column) => ({
      ...column,
      isDropTarget: canDropLeadOnStage(draggedLead, column.stageKey),
    })),
  };
}
