import { getDirectDownline } from "@/lib/business-engine/utils";
import type { OrganizationTreeNode } from "@/types/organization-center";
import type { EntityId } from "@/types";

export interface DownlineMemberRef {
  memberId: EntityId;
  generation: number;
}

/** 從組織圖（雲端 relationship）收集下線 — 與組織圖顯示一致。 */
export function collectDownlineRefsFromTree(
  node: OrganizationTreeNode,
  maxDepth = 3,
  currentGeneration = 0,
): DownlineMemberRef[] {
  const result: DownlineMemberRef[] = [];

  for (const child of node.children) {
    const generation = currentGeneration + 1;
    if (generation > maxDepth) {
      continue;
    }
    result.push({ memberId: child.member.memberId, generation });
    result.push(...collectDownlineRefsFromTree(child, maxDepth, generation));
  }

  return result;
}

/** 收集下線成員，generation 1 = 直推，最多 maxDepth 代。 */
export function collectDownlineByDepth(
  members: Array<{ id: string; sponsorMemberId?: string }>,
  rootMemberId: EntityId,
  maxDepth = 3,
): DownlineMemberRef[] {
  const result: DownlineMemberRef[] = [];
  let currentGeneration = getDirectDownline(members, rootMemberId);

  for (let depth = 1; depth <= maxDepth && currentGeneration.length > 0; depth += 1) {
    for (const member of currentGeneration) {
      result.push({ memberId: member.id, generation: depth });
    }
    currentGeneration = currentGeneration.flatMap((member) =>
      getDirectDownline(members, member.id),
    );
  }

  return result;
}
