/**
 * Shared primitives for Baki GO domain types.
 *
 * Business rules (ranks, criteria, thresholds) live in docs/BUSINESS_RULES.md —
 * never encode them as fixed logic in these types.
 */

/** Document identifier. Maps to Firestore document ID. */
export type EntityId = string;

/** ISO 8601 date string, e.g. "2026-08-04". */
export type ISODateString = string;

/** Year-month key, e.g. "2026-08". */
export type YearMonth = string;

/**
 * Timestamp compatible with Firestore.
 * At the persistence boundary, convert Firestore Timestamp ↔ Date | string.
 */
export type Timestamp = Date | ISODateString;

/** Base fields for persisted documents. */
export interface StoredEntity {
  id: EntityId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Arbitrary extension point for forward-compatible fields. */
export type EntityMetadata = Record<string, unknown>;

/** Marks types that must never be written to storage — only derived at read time. */
export type Computed<T> = T & { readonly _computed: true };
