import { collectDownlineMemberNumbers } from "@/lib/cloud/build-cloud-organization-tree";
import {
  mapCloudMemberRow,
  mapCloudRelationshipRow,
} from "@/lib/cloud/cloud-member-mapper";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";

export type TrainingOrgAuthContext = {
  members: CloudMember[];
  relationships: CloudOrganizationRelationship[];
  membersById: Map<string, CloudMember>;
};

export async function loadTrainingOrgAuthContext(): Promise<TrainingOrgAuthContext> {
  const supabase = createSupabaseServiceClient();
  const [membersResult, relationshipsResult] = await Promise.all([
    supabase.from("members").select("*").order("created_at", { ascending: true }),
    supabase
      .from("organization_relationships")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }
  if (relationshipsResult.error) {
    throw new Error(relationshipsResult.error.message);
  }

  const members = (membersResult.data ?? []).map((row) => mapCloudMemberRow(row as never));
  const relationships = (relationshipsResult.data ?? []).map((row) =>
    mapCloudRelationshipRow(row as never),
  );
  const membersById = new Map(members.map((member) => [member.id, member]));

  return { members, relationships, membersById };
}

/** Self or recursive downline (organization_relationships ∪ sponsor_member_number). */
export function canViewTrainingMember(
  viewerMemberId: string,
  targetMemberId: string,
  ctx: TrainingOrgAuthContext,
): boolean {
  if (viewerMemberId === targetMemberId) {
    return true;
  }
  return isTrainingDownline(viewerMemberId, targetMemberId, ctx);
}

/** Upline may sign for downline only — never self. */
export function canSignOffTrainingMember(
  viewerMemberId: string,
  traineeMemberId: string,
  ctx: TrainingOrgAuthContext,
): boolean {
  if (viewerMemberId === traineeMemberId) {
    return false;
  }
  return isTrainingDownline(viewerMemberId, traineeMemberId, ctx);
}

export function isTrainingDownline(
  viewerMemberId: string,
  targetMemberId: string,
  ctx: TrainingOrgAuthContext,
): boolean {
  if (viewerMemberId === targetMemberId) {
    return false;
  }
  const viewer = ctx.membersById.get(viewerMemberId);
  const target = ctx.membersById.get(targetMemberId);
  if (!viewer || !target) {
    return false;
  }
  const downline = collectDownlineMemberNumbers(
    viewer.memberNumber,
    ctx.members,
    ctx.relationships,
  );
  return downline.has(target.memberNumber);
}

export function listTrainingDownlineMembers(
  viewerMemberId: string,
  ctx: TrainingOrgAuthContext,
): CloudMember[] {
  const viewer = ctx.membersById.get(viewerMemberId);
  if (!viewer) {
    return [];
  }
  const downlineNumbers = collectDownlineMemberNumbers(
    viewer.memberNumber,
    ctx.members,
    ctx.relationships,
  );
  return ctx.members
    .filter((member) => downlineNumbers.has(member.memberNumber))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}
