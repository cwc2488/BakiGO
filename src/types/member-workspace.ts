import type { EntityId, ISODateString, StoredEntity } from "./common";

export type ProgressPhotoAngle = "front" | "side" | "back";

export interface InBodyRecord extends StoredEntity {
  memberId: EntityId;
  recordDate: ISODateString;
  heightCm: number | null;
  weightKg: number | null;
  skeletalMuscleKg: number | null;
  bodyFatKg: number | null;
  bmi: number | null;
  bodyFatPercent: number | null;
  visceralFatLevel: number | null;
  basalMetabolicRate: number | null;
  bodyAge: number | null;
  note?: string;
}

export interface InBodyRecordCreateInput {
  memberId: EntityId;
  recordDate: ISODateString;
  heightCm?: number | null;
  weightKg?: number | null;
  skeletalMuscleKg?: number | null;
  bodyFatKg?: number | null;
  bmi?: number | null;
  bodyFatPercent?: number | null;
  visceralFatLevel?: number | null;
  basalMetabolicRate?: number | null;
  bodyAge?: number | null;
  note?: string;
}

export interface ProgressPhotoRecord extends StoredEntity {
  memberId: EntityId;
  photoDate: ISODateString;
  angle: ProgressPhotoAngle;
  imageDataUrl: string | null;
  note?: string;
}

export interface ProgressPhotoCreateInput {
  memberId: EntityId;
  photoDate: ISODateString;
  angle: ProgressPhotoAngle;
  imageDataUrl?: string | null;
  note?: string;
}

export interface CoachNote extends StoredEntity {
  memberId: EntityId;
  noteDate: ISODateString;
  category: string;
  content: string;
  followUpItems: string[];
}

export interface CoachNoteCreateInput {
  memberId: EntityId;
  noteDate: ISODateString;
  category: string;
  content: string;
  followUpItems?: string[];
}

export interface CoachNoteUpdateInput {
  noteDate?: ISODateString;
  category?: string;
  content?: string;
  followUpItems?: string[];
}

export type MemberTimelineKind =
  | "inbody"
  | "progress_photo"
  | "coach_note"
  | "transaction"
  | "mission"
  | "achievement";

export interface MemberTimelineEntry {
  id: string;
  kind: MemberTimelineKind;
  label: string;
  eventDate: ISODateString;
  subtitle: string;
}

export interface MemberWorkspaceData {
  inBodyRecords: InBodyRecord[];
  progressPhotos: ProgressPhotoRecord[];
  coachNotes: CoachNote[];
}

export interface MemberDashboardSnapshot {
  currentRank: string;
  vp: number;
  missionLabel: string;
  presidentAiLabel: string;
  monthlyTransactionCount: number;
  lastInBodyDate: ISODateString | null;
  lastInBodySummary: string | null;
  lastTransactionDate: ISODateString | null;
  lastTransactionSummary: string | null;
  lastConsultationDate: ISODateString | null;
  lastConsultationSummary: string | null;
}

export const PROGRESS_PHOTO_ANGLE_LABELS: Record<ProgressPhotoAngle, string> = {
  front: "正面",
  side: "側面",
  back: "背面",
};

export const COACH_NOTE_CATEGORIES = [
  "諮詢",
  "追蹤",
  "產品",
  "營養",
  "運動",
  "其他",
] as const;

export const MEMBER_TIMELINE_KIND_LABELS: Record<MemberTimelineKind, string> = {
  inbody: "體組成",
  progress_photo: "進度照片",
  coach_note: "教練筆記",
  transaction: "成交",
  mission: "任務",
  achievement: "成就",
};
