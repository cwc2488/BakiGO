import type {
  EntityId,
  EntityMetadata,
  ISODateString,
  StoredEntity,
} from "./common";

export type BakiEventCategory = "transaction" | "activity" | "qualification";

export interface BakiEventTransactionMetadata {
  customerName: string;
  customerPhone?: string;
  currencyCode: string;
  note?: string;
  productKey?: string;
  recruitMemberId?: string;
  recruitCategory?: string;
}

export interface BakiEvent extends StoredEntity {
  organizationId: EntityId;
  memberId: EntityId;
  eventTypeKey: string;
  eventCategory: BakiEventCategory;
  eventDate: ISODateString;
  value?: number;
  retailHouseKey?: string;
  metadata?: EntityMetadata & Partial<BakiEventTransactionMetadata>;
}

export interface BakiEventCreateInput {
  organizationId: EntityId;
  memberId: EntityId;
  eventTypeKey: string;
  eventCategory: BakiEventCategory;
  eventDate: ISODateString;
  value?: number;
  retailHouseKey?: string;
  metadata?: EntityMetadata & Partial<BakiEventTransactionMetadata>;
}
