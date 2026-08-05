import { getCurrentMember } from "@/lib/auth/auth-service";
import {
  canAdjustDownlineRank,
} from "@/lib/auth/organization-access";
import {
  isValidRegistrationRankKey,
  resolveRegistrationRoleKey,
} from "@/lib/auth/registration-ranks";
import { loadAllMembers } from "@/lib/members/member-service";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";

export function adjustDownlineRank(
  targetMemberId: EntityId,
  newRankKey: string,
  storage: StorageAdapter,
): Member {
  const viewer = getCurrentMember(storage);
  if (!viewer) {
    throw new Error("請先登入");
  }

  const allMembers = loadAllMembers(storage);
  if (!canAdjustDownlineRank(viewer, targetMemberId, allMembers)) {
    throw new Error("無權限調整此夥伴位階");
  }

  if (!isValidRegistrationRankKey(newRankKey)) {
    throw new Error("無效的位階");
  }

  return createMemberRepository(storage).update(targetMemberId, {
    rankKey: newRankKey,
    roleKey: resolveRegistrationRoleKey(newRankKey),
  });
}
