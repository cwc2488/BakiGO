import { collectDownlineMemberNumbers } from "@/lib/cloud/build-cloud-organization-tree";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";

/** Slim CloudMember shape for Training auth/display only. */
export type TrainingOrgAuthContext = {
  members: CloudMember[];
  relationships: CloudOrganizationRelationship[];
  membersById: Map<string, CloudMember>;
};

type SlimMemberRow = {
  id: string;
  member_number: string;
  name: string;
  sponsor_member_number: string | null;
  created_at: string;
};

type SlimRelationshipRow = {
  parent_member_number: string;
  child_member_number: string;
};

function mapSlimMember(row: SlimMemberRow): CloudMember {
  return {
    id: row.id,
    memberNumber: row.member_number,
    name: row.name,
    email: "",
    role: "member",
    currentLevel: "",
    sponsorMemberNumber: row.sponsor_member_number,
    avatarUrl: null,
    createdAt: row.created_at.slice(0, 10),
  };
}

function mapSlimRelationship(row: SlimRelationshipRow): CloudOrganizationRelationship {
  return {
    id: `${row.parent_member_number}:${row.child_member_number}`,
    parentMemberNumber: row.parent_member_number,
    childMemberNumber: row.child_member_number,
    createdAt: "",
  };
}

/**
 * Loads only columns Training needs for hierarchy + display.
 * Does not change organization semantics — still unions relationships ∪ sponsor.
 */
export async function loadTrainingOrgAuthContext(): Promise<TrainingOrgAuthContext> {
  const supabase = createSupabaseServiceClient();
  const [membersResult, relationshipsResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, member_number, name, sponsor_member_number, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("organization_relationships")
      .select("parent_member_number, child_member_number"),
  ]);

  if (membersResult.error) {
    throw new Error(membersResult.error.message);
  }
  if (relationshipsResult.error) {
    throw new Error(relationshipsResult.error.message);
  }

  const members = (membersResult.data ?? []).map((row) =>
    mapSlimMember(row as SlimMemberRow),
  );
  const relationships = (relationshipsResult.data ?? []).map((row) =>
    mapSlimRelationship(row as SlimRelationshipRow),
  );
  const membersById = new Map(members.map((member) => [member.id, member]));

  return { members, relationships, membersById };
}

/** Own-checklist fast path: one member row, no full org graph. */
export async function loadTrainingMemberById(
  memberId: string,
): Promise<CloudMember | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, member_number, name, sponsor_member_number, created_at")
    .eq("id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? mapSlimMember(data as SlimMemberRow) : null;
}

export async function loadTrainingMemberNamesByIds(
  memberIds: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(memberIds.filter(Boolean)));
  const result = new Map<string, string>();
  if (unique.length === 0) {
    return result;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, name")
    .in("id", unique);

  if (error) {
    throw new Error(error.message);
  }
  for (const row of data ?? []) {
    const typed = row as { id: string; name: string };
    result.set(typed.id, typed.name);
  }
  return result;
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
