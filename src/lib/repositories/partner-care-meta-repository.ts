import type { EntityId, ISODateString } from "@/types/common";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";

export interface PartnerCareMeta {
  memberId: EntityId;
  lastContactDate?: ISODateString;
  nextFollowUpDate?: ISODateString;
}

function parseArray(raw: string | null): PartnerCareMeta[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as PartnerCareMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getPartnerCareMeta(
  storage: StorageAdapter,
  memberId: EntityId,
): PartnerCareMeta | undefined {
  return parseArray(storage.getItem(STORAGE_KEYS.partnerCareMeta)).find(
    (item) => item.memberId === memberId,
  );
}

export function upsertPartnerCareMeta(
  storage: StorageAdapter,
  memberId: EntityId,
  patch: Partial<Omit<PartnerCareMeta, "memberId">>,
): PartnerCareMeta {
  const all = parseArray(storage.getItem(STORAGE_KEYS.partnerCareMeta));
  const index = all.findIndex((item) => item.memberId === memberId);
  const current = index >= 0 ? all[index] : { memberId };
  const next: PartnerCareMeta = {
    ...current,
    ...patch,
    memberId,
  };

  if (index >= 0) {
    all[index] = next;
  } else {
    all.push(next);
  }

  storage.setItem(STORAGE_KEYS.partnerCareMeta, JSON.stringify(all));
  return next;
}
