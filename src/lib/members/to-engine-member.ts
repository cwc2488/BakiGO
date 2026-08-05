import type { AppMember } from "@/lib/config/app-config";
import type { Member } from "@/types/member";

export function toEngineMember(member: Member): AppMember {
  return {
    id: member.id,
    displayName: member.displayName,
    nickname: member.nickname,
    rankKey: member.rankKey,
    sponsorMemberId: member.sponsorMemberId,
    joinedAt: member.joinedAt,
  };
}
