import type { EntityId, ISODateString, StoredEntity } from "./common";

export type CustomerStatus = "active" | "paused" | "converted";

export interface Customer extends StoredEntity {
  ownerMemberId: EntityId;
  displayName: string;
  phone?: string;
  lineId?: string;
  birthYear?: number;
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
  note?: string;
  pipelineLeadId?: EntityId;
}

export interface CustomerUpdateInput {
  displayName?: string;
  phone?: string;
  lineId?: string;
  birthYear?: number;
  status?: CustomerStatus;
  note?: string;
  lastContactDate?: ISODateString;
  nextFollowUpDate?: ISODateString;
}

export interface BodyCompositionRecord extends StoredEntity {
  customerId: EntityId;
  recordDate: ISODateString;
  age: number | null;
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

export interface BodyCompositionRecordCreateInput {
  customerId: EntityId;
  recordDate: ISODateString;
  age?: number | null;
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

export interface CustomerPortalToken extends StoredEntity {
  customerId: EntityId;
  token: string;
  expiresAt?: string;
  revokedAt?: string;
}
