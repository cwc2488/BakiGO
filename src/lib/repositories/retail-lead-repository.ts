import type {
  RetailPipelineLead,
  RetailPipelineLeadCreateInput,
  RetailPipelineStageKey,
} from "@/types/retail-pipeline";
import type { EntityId, ISODateString } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeStageKey(stageKey: string): RetailPipelineStageKey {
  if (stageKey === "trial_drink") {
    return "consultation";
  }
  return stageKey as RetailPipelineStageKey;
}

function parseLeads(raw: string | null): RetailPipelineLead[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as RetailPipelineLead[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((lead) => ({
      ...lead,
      stageKey: normalizeStageKey(lead.stageKey),
    }));
  } catch {
    return [];
  }
}

export interface RetailLeadRepository {
  getAll(): RetailPipelineLead[];
  getByOwner(ownerMemberId: EntityId): RetailPipelineLead[];
  getById(leadId: EntityId): RetailPipelineLead | undefined;
  create(input: RetailPipelineLeadCreateInput): RetailPipelineLead;
  updateStage(leadId: EntityId, stageKey: RetailPipelineStageKey): RetailPipelineLead;
  updateScheduledDate(leadId: EntityId, scheduledDate: ISODateString | undefined): RetailPipelineLead;
  updateSchedule(
    leadId: EntityId,
    input: {
      scheduledDate?: ISODateString;
      scheduledTime?: string;
      calendarEventId?: EntityId;
    },
  ): RetailPipelineLead;
  updateRegion(leadId: EntityId, region: string | undefined): RetailPipelineLead;
  delete(leadId: EntityId): void;
}

export class LocalStorageRetailLeadRepository implements RetailLeadRepository {
  constructor(private readonly storage: StorageAdapter) {}

  getAll(): RetailPipelineLead[] {
    return parseLeads(this.storage.getItem(STORAGE_KEYS.retailPipelineLeads));
  }

  getByOwner(ownerMemberId: EntityId): RetailPipelineLead[] {
    return this.getAll().filter((lead) => lead.ownerMemberId === ownerMemberId);
  }

  getById(leadId: EntityId): RetailPipelineLead | undefined {
    return this.getAll().find((lead) => lead.id === leadId);
  }

  create(input: RetailPipelineLeadCreateInput): RetailPipelineLead {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const lead: RetailPipelineLead = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      organizationId: input.organizationId,
      ownerMemberId: input.ownerMemberId,
      displayName: input.displayName.trim(),
      stageKey: "stranger",
      stageUpdatedAt: today,
      scheduledDate: input.scheduledDate,
      region: input.region?.trim() || undefined,
      note: input.note?.trim() || undefined,
    };

    const next = [...this.getAll(), lead];
    this.storage.setItem(STORAGE_KEYS.retailPipelineLeads, JSON.stringify(next));
    return lead;
  }

  updateStage(leadId: EntityId, stageKey: RetailPipelineStageKey): RetailPipelineLead {
    const leads = this.getAll();
    const index = leads.findIndex((lead) => lead.id === leadId);
    if (index < 0) {
      throw new Error(`Pipeline lead not found: ${leadId}`);
    }

    const now = new Date().toISOString();
    const updated: RetailPipelineLead = {
      ...leads[index],
      stageKey,
      stageUpdatedAt: now.slice(0, 10),
      updatedAt: now,
    };

    const next = [...leads];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.retailPipelineLeads, JSON.stringify(next));
    return updated;
  }

  updateScheduledDate(
    leadId: EntityId,
    scheduledDate: ISODateString | undefined,
  ): RetailPipelineLead {
    return this.updateSchedule(leadId, { scheduledDate });
  }

  updateSchedule(
    leadId: EntityId,
    input: {
      scheduledDate?: ISODateString;
      scheduledTime?: string;
      calendarEventId?: EntityId;
    },
  ): RetailPipelineLead {
    const leads = this.getAll();
    const index = leads.findIndex((lead) => lead.id === leadId);
    if (index < 0) {
      throw new Error(`Pipeline lead not found: ${leadId}`);
    }

    const now = new Date().toISOString();
    const current = leads[index];
    const updated: RetailPipelineLead = {
      ...current,
      scheduledDate:
        input.scheduledDate === undefined ? current.scheduledDate : input.scheduledDate || undefined,
      scheduledTime:
        input.scheduledTime === undefined ? current.scheduledTime : input.scheduledTime || undefined,
      calendarEventId:
        input.calendarEventId === undefined ? current.calendarEventId : input.calendarEventId || undefined,
      updatedAt: now,
    };

    if (!updated.scheduledDate) {
      updated.scheduledTime = undefined;
      updated.calendarEventId = undefined;
    }

    const next = [...leads];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.retailPipelineLeads, JSON.stringify(next));
    return updated;
  }

  delete(leadId: EntityId): void {
    const next = this.getAll().filter((lead) => lead.id !== leadId);
    this.storage.setItem(STORAGE_KEYS.retailPipelineLeads, JSON.stringify(next));
  }

  updateRegion(leadId: EntityId, region: string | undefined): RetailPipelineLead {
    const leads = this.getAll();
    const index = leads.findIndex((lead) => lead.id === leadId);
    if (index < 0) {
      throw new Error(`Pipeline lead not found: ${leadId}`);
    }

    const now = new Date().toISOString();
    const updated: RetailPipelineLead = {
      ...leads[index],
      region: region?.trim() || undefined,
      updatedAt: now,
    };

    const next = [...leads];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.retailPipelineLeads, JSON.stringify(next));
    return updated;
  }
}

export function createRetailLeadRepository(storage: StorageAdapter): RetailLeadRepository {
  return new LocalStorageRetailLeadRepository(storage);
}
