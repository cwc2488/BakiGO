import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";

export type QuickRecruitCategory = "preferred_customer" | "distributor";

export const QUICK_RECRUIT_CATEGORY_LABELS: Record<QuickRecruitCategory, string> = {
  preferred_customer: "優惠顧客",
  distributor: "直銷商",
};

export interface QuickRecruitInput {
  displayName: string;
  phone?: string;
  category: QuickRecruitCategory;
  note?: string;
}

function buildRecruitHerbalifeId(sequence: number): string {
  return `RC${Date.now().toString().slice(-6)}${sequence.toString().padStart(2, "0")}`;
}

export function createQuickRecruitMember(storage: StorageAdapter, input: QuickRecruitInput): Member {
  const sponsorMemberId = resolveAuthenticatedMemberId(storage);
  const memberRepository = createMemberRepository(storage);
  const joinedAt = todayISODate();
  const yearRecruits = memberRepository
    .getAll()
    .filter(
      (member) =>
        member.sponsorMemberId === sponsorMemberId &&
        member.joinedAt.startsWith(joinedAt.slice(0, 4)),
    ).length;

  const displayName = input.displayName.trim() || `新會員 ${yearRecruits + 1}`;
  const categoryLabel = QUICK_RECRUIT_CATEGORY_LABELS[input.category];
  const tags =
    input.category === "distributor"
      ? ["超級聯賽招募", categoryLabel]
      : [categoryLabel];

  return memberRepository.create({
    organizationId: APP_IDS.organizationId,
    herbalifeMemberId: buildRecruitHerbalifeId(yearRecruits + 1),
    displayName,
    phone: input.phone?.trim() || undefined,
    notes: input.note?.trim() || undefined,
    joinedAt,
    sponsorMemberId,
    rankKey: RANK_KEYS.NEW_MEMBER,
    roleKey: "member",
    tags,
    metadata: {
      recruitCategory: input.category,
    },
  });
}
