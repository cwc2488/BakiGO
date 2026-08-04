import type {
  EntityId,
  EntityMetadata,
  ISODateString,
  StoredEntity,
  Timestamp,
} from "./common";

/**
 * Persisted member record.
 *
 * Rank, progress, stats, and daily actions are computed — do not store them here.
 * Rank keys are defined in docs/BUSINESS_RULES.md, not as hardcoded enums.
 */
export interface Member extends StoredEntity {
  organizationId: EntityId;

  /** Display name shown in greetings and team views. */
  displayName: string;

  /** Optional nickname, e.g. "巴其哥". */
  nickname?: string;

  /**
   * Current rank key, e.g. "new_member", "supervisor", "president".
   * Valid values are organization-configured; see docs/BUSINESS_RULES.md.
   */
  rankKey: string;

  /**
   * Role key for permissions, e.g. "member", "leader", "admin".
   * Valid values are organization-configured.
   */
  roleKey: string;

  /** Direct sponsor in the organization tree. */
  sponsorMemberId?: EntityId;

  /** Team assignment within the organization. */
  teamId?: EntityId;

  /** Date the member joined the organization. */
  joinedAt: ISODateString;

  /** Extension fields without schema migration. */
  metadata?: EntityMetadata;
}

/** Fields required to create a new member. */
export interface MemberCreateInput {
  organizationId: EntityId;
  displayName: string;
  nickname?: string;
  rankKey: string;
  roleKey: string;
  sponsorMemberId?: EntityId;
  teamId?: EntityId;
  joinedAt: ISODateString;
  metadata?: EntityMetadata;
}

/** Partial update for mutable member fields. Rank changes may be system-driven. */
export interface MemberUpdateInput {
  displayName?: string;
  nickname?: string;
  rankKey?: string;
  roleKey?: string;
  sponsorMemberId?: EntityId;
  teamId?: EntityId;
  metadata?: EntityMetadata;
}

/**
 * Derived member snapshot — never persisted.
 * Built from Member + activity records + business rules.
 */
export interface MemberSummary {
  memberId: EntityId;
  displayName: string;
  nickname?: string;
  rankKey: string;
  rankLabel: string;
  monthlyChallengeProgressPercent: number;
  presidentTreeActiveLines: number;
  presidentTreeTotalLines: number;
  computedAt: Timestamp;
}
