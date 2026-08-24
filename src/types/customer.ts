import type { EntityId, ISODateString, StoredEntity } from "./common";

export type CustomerStatus = "active" | "paused" | "converted";
export type CustomerSex = "male" | "female" | "other" | "prefer_not_to_say";
export type CustomerPhotoPhase = "before" | "after";
export type CustomerPhotoAngle = "front" | "side" | "back";

export const CUSTOMER_PHOTO_PHASE_LABELS: Record<CustomerPhotoPhase, string> = {
  before: "使用前",
  after: "使用後",
};

export const CUSTOMER_PHOTO_ANGLE_LABELS: Record<CustomerPhotoAngle, string> = {
  front: "正面",
  side: "側面",
  back: "背面",
};

export const CUSTOMER_SEX_LABELS: Record<CustomerSex, string> = {
  male: "男",
  female: "女",
  other: "其他",
  prefer_not_to_say: "不便透露",
};

export const CUSTOMER_SEX_OPTIONS = Object.keys(CUSTOMER_SEX_LABELS) as CustomerSex[];

export interface Customer extends StoredEntity {
  ownerMemberId: EntityId;
  displayName: string;
  phone?: string;
  lineId?: string;
  birthYear?: number;
  /** Full birth date (YYYY-MM-DD). Preferred over birthYear when set. */
  birthDate?: ISODateString;
  /** Fixed height — set once on the customer profile, not per measurement. */
  heightCm?: number;
  sex?: CustomerSex;
  region?: string;
  occupation?: string;
  status: CustomerStatus;
  pipelineLeadId?: EntityId;
  linkedMemberId?: EntityId;
  note?: string;
  lastContactDate?: ISODateString;
  nextFollowUpDate?: ISODateString;
}

export interface CustomerCreateInput {
  ownerMemberId: EntityId;
  displayName: string;
  phone?: string;
  lineId?: string;
  birthYear?: number;
  birthDate?: ISODateString;
  heightCm?: number;
  sex?: CustomerSex;
  region?: string;
  occupation?: string;
  note?: string;
  pipelineLeadId?: EntityId;
}

export interface CustomerUpdateInput {
  displayName?: string;
  phone?: string;
  lineId?: string;
  birthYear?: number;
  birthDate?: ISODateString;
  heightCm?: number;
  sex?: CustomerSex;
  region?: string;
  occupation?: string;
  status?: CustomerStatus;
  linkedMemberId?: EntityId | null;
  note?: string;
  lastContactDate?: ISODateString;
  nextFollowUpDate?: ISODateString;
}

export interface BodyCompositionRecord extends StoredEntity {
  customerId: EntityId;
  recordDate: ISODateString;
  age: number | null;
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

export interface BodyCompositionRecordCreateInput {
  customerId: EntityId;
  recordDate: ISODateString;
  age?: number | null;
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

export type BodyCompositionRecordUpdateInput = BodyCompositionRecordCreateInput;

export interface CustomerProgressPhoto extends StoredEntity {
  customerId: EntityId;
  phase: CustomerPhotoPhase;
  angle: CustomerPhotoAngle;
  photoDate: ISODateString;
  imageDataUrl: string | null;
  note?: string;
}

export interface CustomerProgressPhotoCreateInput {
  customerId: EntityId;
  phase: CustomerPhotoPhase;
  angle: CustomerPhotoAngle;
  photoDate: ISODateString;
  imageDataUrl?: string | null;
  note?: string;
}

export interface CustomerReceiptPhoto extends StoredEntity {
  customerId: EntityId;
  receiptDate: ISODateString;
  imageDataUrl: string;
  note?: string;
  /** Inclusive last day this receipt should be kept (receipt date + 2 years). */
  retainUntil: ISODateString;
}

export interface CustomerReceiptPhotoCreateInput {
  customerId: EntityId;
  receiptDate: ISODateString;
  imageDataUrl: string;
  note?: string;
}

export interface CustomerPortalToken extends StoredEntity {
  customerId: EntityId;
  token: string;
  expiresAt?: string;
  revokedAt?: string;
}
