import { APP_IDS } from "@/lib/config/app-config";
import { tryAutoLinkCustomerOnMemberJoin } from "@/lib/customers/customer-member-bridge";
import { ensureVirtualUplineInMembers, createVirtualUplineMember } from "@/lib/members/virtual-upline";
import { normalizeHerbalifeMemberId } from "@/types/auth";
import type {
  Member,
  MemberCreateInput,
  MemberUpdateInput,
} from "@/types/member";
import type { EntityId } from "@/types";
import { STORAGE_KEYS } from "./storage-keys";
import type { StorageAdapter } from "./storage-adapter";

export interface MemberRepository {
  getAll(): Member[];
  getById(memberId: EntityId): Member | undefined;
  getByHerbalifeMemberId(herbalifeMemberId: string): Member | undefined;
  create(input: MemberCreateInput): Member;
  update(memberId: EntityId, input: MemberUpdateInput): Member;
  delete(memberId: EntityId): void;
}

function parseMembers(raw: string | null): Member[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Member[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `member-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function seedDefaultMembers(): Member[] {
  return [createVirtualUplineMember()];
}

function normalizeStoredMembers(members: Member[]): { members: Member[]; changed: boolean } {
  let next = members;
  let changed = false;

  const withHerbalifeIds = members.map((member) =>
    member.herbalifeMemberId
      ? member
      : {
          ...member,
          herbalifeMemberId:
            member.id === APP_IDS.currentMemberId
              ? "ROOT00001"
              : `LEGACY-${member.id.slice(0, 8).toUpperCase()}`,
        },
  );

  if (withHerbalifeIds.some((member, index) => member !== members[index])) {
    next = withHerbalifeIds;
    changed = true;
  }

  const withVirtualUpline = ensureVirtualUplineInMembers(next);
  if (withVirtualUpline.changed) {
    next = withVirtualUpline.members;
    changed = true;
  }

  return { members: next, changed };
}

export class LocalStorageMemberRepository implements MemberRepository {
  constructor(private readonly storage: StorageAdapter) {}

  private isCloudMembersMode(): boolean {
    return this.storage.getItem(STORAGE_KEYS.cloudMembersMode) === "1";
  }

  getAll(): Member[] {
    const members = parseMembers(this.storage.getItem(STORAGE_KEYS.members));
    if (this.isCloudMembersMode()) {
      return members;
    }

    if (members.length === 0) {
      const seeded = seedDefaultMembers();
      this.storage.setItem(STORAGE_KEYS.members, JSON.stringify(seeded));
      return seeded;
    }

    const normalized = normalizeStoredMembers(members);
    if (normalized.changed) {
      this.storage.setItem(STORAGE_KEYS.members, JSON.stringify(normalized.members));
    }

    return normalized.members;
  }

  getById(memberId: EntityId): Member | undefined {
    return this.getAll().find((member) => member.id === memberId);
  }

  getByHerbalifeMemberId(herbalifeMemberId: string): Member | undefined {
    const normalized = normalizeHerbalifeMemberId(herbalifeMemberId);
    return this.getAll().find((member) => member.herbalifeMemberId === normalized);
  }

  create(input: MemberCreateInput): Member {
    const now = new Date().toISOString();
    const member: Member = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      organizationId: input.organizationId,
      herbalifeMemberId: normalizeHerbalifeMemberId(input.herbalifeMemberId),
      displayName: input.displayName,
      nickname: input.nickname,
      gender: input.gender,
      birthday: input.birthday,
      phone: input.phone,
      lineId: input.lineId,
      instagram: input.instagram,
      email: input.email,
      joinedAt: input.joinedAt,
      sponsorMemberId: input.sponsorMemberId,
      coachId: input.coachId,
      status: input.status ?? "active",
      goal: input.goal,
      occupation: input.occupation,
      city: input.city,
      notes: input.notes,
      tags: input.tags ?? [],
      rankKey: input.rankKey,
      roleKey: input.roleKey,
      teamId: input.teamId,
      metadata: input.metadata,
    };

    const next = [...this.getAll(), member];
    this.storage.setItem(STORAGE_KEYS.members, JSON.stringify(next));
    tryAutoLinkCustomerOnMemberJoin(member, this.storage);
    return member;
  }

  update(memberId: EntityId, input: MemberUpdateInput): Member {
    const members = this.getAll();
    const index = members.findIndex((member) => member.id === memberId);
    if (index < 0) {
      throw new Error(`Member not found: ${memberId}`);
    }

    const updated: Member = {
      ...members[index],
      ...input,
      tags: input.tags ?? members[index].tags,
      updatedAt: new Date().toISOString(),
    };

    const next = [...members];
    next[index] = updated;
    this.storage.setItem(STORAGE_KEYS.members, JSON.stringify(next));
    return updated;
  }

  delete(memberId: EntityId): void {
    if (memberId === APP_IDS.virtualUplineMemberId) {
      throw new Error("Cannot delete virtual upline member");
    }

    const next = this.getAll().filter((member) => member.id !== memberId);
    this.storage.setItem(STORAGE_KEYS.members, JSON.stringify(next));
  }
}

export function createMemberRepository(storage: StorageAdapter): MemberRepository {
  return new LocalStorageMemberRepository(storage);
}
