import { APP_IDS } from "@/lib/config/app-config";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import type { Member } from "@/types/member";

export function isVirtualUplineMember(member: Member | undefined): boolean {
  if (!member) {
    return false;
  }

  return (
    member.id === APP_IDS.virtualUplineMemberId ||
    member.herbalifeMemberId === APP_IDS.virtualUplineHerbalifeMemberId ||
    member.metadata?.virtualUpline === true
  );
}

export function createVirtualUplineMember(now: string = new Date().toISOString()): Member {
  return {
    id: APP_IDS.virtualUplineMemberId,
    createdAt: now,
    updatedAt: now,
    organizationId: APP_IDS.organizationId,
    herbalifeMemberId: APP_IDS.virtualUplineHerbalifeMemberId,
    displayName: "虛擬上線",
    nickname: "虛擬上線",
    email: "virtual-upline@baki-go.local",
    joinedAt: "2000-01-01",
    status: "active",
    tags: ["virtual"],
    rankKey: RANK_KEYS.NEW_MEMBER,
    roleKey: "member",
    metadata: { virtualUpline: true },
  };
}

function needsVirtualUplineNormalization(member: Member): boolean {
  return (
    member.id !== APP_IDS.virtualUplineMemberId ||
    member.herbalifeMemberId !== APP_IDS.virtualUplineHerbalifeMemberId ||
    member.displayName !== "虛擬上線" ||
    member.metadata?.virtualUpline !== true
  );
}

function normalizeVirtualUplineRecord(member: Member, now: string): Member {
  return {
    ...member,
    id: APP_IDS.virtualUplineMemberId,
    herbalifeMemberId: APP_IDS.virtualUplineHerbalifeMemberId,
    displayName: "虛擬上線",
    nickname: "虛擬上線",
    status: "active",
    tags: Array.from(new Set([...(member.tags ?? []), "virtual"])),
    metadata: { ...member.metadata, virtualUpline: true },
    updatedAt: now,
  };
}

export function ensureVirtualUplineInMembers(members: Member[]): {
  members: Member[];
  changed: boolean;
} {
  const now = new Date().toISOString();
  let next = [...members];
  let changed = false;

  const virtualIndex = next.findIndex((member) => isVirtualUplineMember(member));
  let virtualMember: Member;

  if (virtualIndex < 0) {
    virtualMember = createVirtualUplineMember(now);
    next = [virtualMember, ...next];
    changed = true;
  } else {
    virtualMember = next[virtualIndex];
    if (needsVirtualUplineNormalization(virtualMember)) {
      next[virtualIndex] = normalizeVirtualUplineRecord(virtualMember, now);
      virtualMember = next[virtualIndex];
      changed = true;
    }
  }

  const presidentIndex = next.findIndex(
    (member) =>
      member.id === APP_IDS.currentMemberId || member.herbalifeMemberId === "ROOT00001",
  );
  if (presidentIndex >= 0) {
    const president = next[presidentIndex];
    if (president.sponsorMemberId !== virtualMember.id) {
      next[presidentIndex] = {
        ...president,
        sponsorMemberId: virtualMember.id,
        updatedAt: now,
      };
      changed = true;
    }
  }

  return { members: next, changed };
}
