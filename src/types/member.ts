import type {
  EntityId,
  EntityMetadata,
  ISODateString,
  StoredEntity,
  Timestamp,
} from "./common";

export type MemberStatus = "active" | "inactive" | "archived";

/**
 * Persisted member record — CRM source of truth.
 *
 * Rank, progress, stats, and daily actions are computed — do not store them here.
 */
export interface Member extends StoredEntity {
  organizationId: EntityId;

  /** Herbalife Member ID — unique login identity */
  herbalifeMemberId: string;

  /** Legal / display name */
  displayName: string;
  /** Public avatar image URL (Supabase Storage). */
  avatarUrl?: string | null;
  nickname?: string;
  gender?: string;
  birthday?: ISODateString;
  phone?: string;
  lineId?: string;
  instagram?: string;
  email?: string;
  joinedAt: ISODateString;

  /** Direct referrer / sponsor in the organization tree. */
  sponsorMemberId?: EntityId;
  /** Assigned coach / upline leader. */
  coachId?: EntityId;

  status: MemberStatus;
  goal?: string;
  occupation?: string;
  city?: string;
  notes?: string;
  tags: string[];

  rankKey: string;
  roleKey: string;
  teamId?: EntityId;
  metadata?: EntityMetadata;
}

export interface MemberCreateInput {
  organizationId: EntityId;
  herbalifeMemberId: string;
  displayName: string;
  nickname?: string;
  gender?: string;
  birthday?: ISODateString;
  phone?: string;
  lineId?: string;
  instagram?: string;
  email?: string;
  joinedAt: ISODateString;
  sponsorMemberId?: EntityId;
  coachId?: EntityId;
  status?: MemberStatus;
  goal?: string;
  occupation?: string;
  city?: string;
  notes?: string;
  tags?: string[];
  rankKey: string;
  roleKey: string;
  teamId?: EntityId;
  metadata?: EntityMetadata;
}

export interface MemberUpdateInput {
  displayName?: string;
  avatarUrl?: string | null;
  nickname?: string;
  gender?: string;
  birthday?: ISODateString;
  phone?: string;
  lineId?: string;
  instagram?: string;
  email?: string;
  joinedAt?: ISODateString;
  sponsorMemberId?: EntityId;
  coachId?: EntityId;
  status?: MemberStatus;
  goal?: string;
  occupation?: string;
  city?: string;
  notes?: string;
  tags?: string[];
  rankKey?: string;
  roleKey?: string;
  teamId?: EntityId;
  metadata?: EntityMetadata;
}

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
