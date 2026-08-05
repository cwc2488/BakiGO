import type {
  CoachNote,
  CoachNoteCreateInput,
  CoachNoteUpdateInput,
  InBodyRecord,
  InBodyRecordCreateInput,
  MemberWorkspaceData,
  ProgressPhotoCreateInput,
  ProgressPhotoRecord,
} from "@/types/member-workspace";
import type { EntityId } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readInBodyRecords(storage: StorageAdapter): InBodyRecord[] {
  return parseArray<InBodyRecord>(storage.getItem(STORAGE_KEYS.memberInBodyRecords));
}

function readProgressPhotos(storage: StorageAdapter): ProgressPhotoRecord[] {
  return parseArray<ProgressPhotoRecord>(storage.getItem(STORAGE_KEYS.memberProgressPhotos));
}

function readCoachNotes(storage: StorageAdapter): CoachNote[] {
  return parseArray<CoachNote>(storage.getItem(STORAGE_KEYS.memberCoachNotes));
}

export interface MemberWorkspaceRepository {
  loadWorkspace(memberId: EntityId): MemberWorkspaceData;
  createInBodyRecord(input: InBodyRecordCreateInput): InBodyRecord;
  getInBodyRecords(memberId: EntityId): InBodyRecord[];
  createProgressPhoto(input: ProgressPhotoCreateInput): ProgressPhotoRecord;
  getProgressPhotos(memberId: EntityId): ProgressPhotoRecord[];
  createCoachNote(input: CoachNoteCreateInput): CoachNote;
  updateCoachNote(noteId: EntityId, input: CoachNoteUpdateInput): CoachNote;
  getCoachNotes(memberId: EntityId): CoachNote[];
}

export class LocalStorageMemberWorkspaceRepository implements MemberWorkspaceRepository {
  constructor(private readonly storage: StorageAdapter) {}

  loadWorkspace(memberId: EntityId): MemberWorkspaceData {
    return {
      inBodyRecords: this.getInBodyRecords(memberId),
      progressPhotos: this.getProgressPhotos(memberId),
      coachNotes: this.getCoachNotes(memberId),
    };
  }

  getInBodyRecords(memberId: EntityId): InBodyRecord[] {
    return readInBodyRecords(this.storage)
      .filter((record) => record.memberId === memberId)
      .sort((left, right) => right.recordDate.localeCompare(left.recordDate));
  }

  createInBodyRecord(input: InBodyRecordCreateInput): InBodyRecord {
    const now = new Date().toISOString();
    const record: InBodyRecord = {
      id: createId("inbody"),
      createdAt: now,
      updatedAt: now,
      memberId: input.memberId,
      recordDate: input.recordDate,
      heightCm: input.heightCm ?? null,
      weightKg: input.weightKg ?? null,
      skeletalMuscleKg: input.skeletalMuscleKg ?? null,
      bodyFatKg: input.bodyFatKg ?? null,
      bmi: input.bmi ?? null,
      bodyFatPercent: input.bodyFatPercent ?? null,
      visceralFatLevel: input.visceralFatLevel ?? null,
      basalMetabolicRate: input.basalMetabolicRate ?? null,
      bodyAge: input.bodyAge ?? null,
      note: input.note,
    };

    const next = [...readInBodyRecords(this.storage), record];
    this.storage.setItem(STORAGE_KEYS.memberInBodyRecords, JSON.stringify(next));
    return record;
  }

  getProgressPhotos(memberId: EntityId): ProgressPhotoRecord[] {
    return readProgressPhotos(this.storage)
      .filter((photo) => photo.memberId === memberId)
      .sort((left, right) => right.photoDate.localeCompare(left.photoDate));
  }

  createProgressPhoto(input: ProgressPhotoCreateInput): ProgressPhotoRecord {
    const now = new Date().toISOString();
    const photo: ProgressPhotoRecord = {
      id: createId("photo"),
      createdAt: now,
      updatedAt: now,
      memberId: input.memberId,
      photoDate: input.photoDate,
      angle: input.angle,
      imageDataUrl: input.imageDataUrl ?? null,
      note: input.note,
    };

    const next = [...readProgressPhotos(this.storage), photo];
    this.storage.setItem(STORAGE_KEYS.memberProgressPhotos, JSON.stringify(next));
    return photo;
  }

  getCoachNotes(memberId: EntityId): CoachNote[] {
    return readCoachNotes(this.storage)
      .filter((note) => note.memberId === memberId)
      .sort((left, right) => right.noteDate.localeCompare(left.noteDate));
  }

  createCoachNote(input: CoachNoteCreateInput): CoachNote {
    const now = new Date().toISOString();
    const note: CoachNote = {
      id: createId("coach-note"),
      createdAt: now,
      updatedAt: now,
      memberId: input.memberId,
      noteDate: input.noteDate,
      category: input.category,
      content: input.content,
      followUpItems: input.followUpItems ?? [],
    };

    const next = [...readCoachNotes(this.storage), note];
    this.storage.setItem(STORAGE_KEYS.memberCoachNotes, JSON.stringify(next));
    return note;
  }

  updateCoachNote(noteId: EntityId, input: CoachNoteUpdateInput): CoachNote {
    const notes = readCoachNotes(this.storage);
    const index = notes.findIndex((note) => note.id === noteId);
    if (index < 0) {
      throw new Error(`Coach note not found: ${noteId}`);
    }

    const updated: CoachNote = {
      ...notes[index],
      ...input,
      followUpItems: input.followUpItems ?? notes[index].followUpItems,
      updatedAt: new Date().toISOString(),
    };

    const next = [...notes];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.memberCoachNotes, JSON.stringify(next));
    return updated;
  }
}

export function createMemberWorkspaceRepository(
  storage: StorageAdapter,
): MemberWorkspaceRepository {
  return new LocalStorageMemberWorkspaceRepository(storage);
}
