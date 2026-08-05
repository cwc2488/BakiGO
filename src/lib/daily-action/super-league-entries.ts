import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { EntityId } from "@/types";

export interface SuperLeagueEntry {
  id: string;
  ownerMemberId: EntityId;
  displayName: string;
  isSupervisor: boolean;
  createdAt: string;
  year: number;
}

function parseEntries(raw: string | null): SuperLeagueEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SuperLeagueEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sl-${Date.now()}`;
}

export function loadSuperLeagueEntries(storage: StorageAdapter): SuperLeagueEntry[] {
  return parseEntries(storage.getItem(STORAGE_KEYS.superLeagueEntries));
}

export function loadMemberSuperLeagueEntries(
  storage: StorageAdapter,
  ownerMemberId: EntityId,
  year: number,
): SuperLeagueEntry[] {
  return loadSuperLeagueEntries(storage).filter(
    (entry) => entry.ownerMemberId === ownerMemberId && entry.year === year,
  );
}

export function addSuperLeagueEntry(
  storage: StorageAdapter,
  input: {
    ownerMemberId: EntityId;
    displayName: string;
    isSupervisor: boolean;
    year: number;
  },
): SuperLeagueEntry {
  const entry: SuperLeagueEntry = {
    id: createId(),
    ownerMemberId: input.ownerMemberId,
    displayName: input.displayName.trim(),
    isSupervisor: input.isSupervisor,
    createdAt: new Date().toISOString(),
    year: input.year,
  };
  const next = [...loadSuperLeagueEntries(storage), entry];
  storage.setItem(STORAGE_KEYS.superLeagueEntries, JSON.stringify(next));
  return entry;
}
