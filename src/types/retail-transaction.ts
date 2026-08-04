import type {
  EntityId,
  EntityMetadata,
  ISODateString,
  StoredEntity,
} from "./common";

/**
 * Persisted retail transaction — single source of truth for retail activity.
 *
 * Aggregates (monthly totals, challenge progress) are computed from these records.
 */
export interface RetailTransaction extends StoredEntity {
  organizationId: EntityId;

  /** Member who logged or owns this transaction. */
  memberId: EntityId;

  /** Customer or member name entered at log time. */
  customerName: string;

  /**
   * Transaction type key, organization-configured.
   * e.g. new_customer_ntd, new_member_vp — see business rules config.
   */
  transactionTypeKey: string;

  /** Business date of the transaction, not the log timestamp. */
  transactionDate: ISODateString;

  /** Transaction amount (NT$) or VP value — see currencyCode. */
  amount: number;

  /** ISO 4217 currency code or "VP" for volume points. */
  currencyCode: string;

  /**
   * Product or service key, organization-configured.
   * Labels live outside the type system (docs or config).
   */
  productKey?: string;

  /**
   * Retail location key, e.g. a specific 零售店.
   * Valid values are organization-configured.
   */
  retailHouseKey?: string;

  /** Free-form note entered once at log time. */
  note?: string;

  metadata?: EntityMetadata;
}

/** Fields required to log a new retail transaction. */
export interface RetailTransactionCreateInput {
  organizationId: EntityId;
  memberId: EntityId;
  customerName: string;
  transactionTypeKey: string;
  transactionDate: ISODateString;
  amount: number;
  currencyCode: string;
  productKey?: string;
  retailHouseKey?: string;
  note?: string;
  metadata?: EntityMetadata;
}

/** Partial update — prefer immutable logs; use sparingly for corrections. */
export interface RetailTransactionUpdateInput {
  transactionDate?: ISODateString;
  amount?: number;
  currencyCode?: string;
  productKey?: string;
  retailHouseKey?: string;
  note?: string;
  metadata?: EntityMetadata;
}

/**
 * Derived retail totals — never persisted.
 */
export interface RetailTransactionSummary {
  memberId: EntityId;
  yearMonth: string;
  transactionCount: number;
  totalAmount: number;
  currencyCode: string;
}
