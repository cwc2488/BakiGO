import {
  mapCloudMemberRow,
  mapCloudRelationshipRow,
} from "@/lib/cloud/cloud-member-mapper";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CloudMember,
  CloudMemberInsert,
  CloudOrganizationRelationship,
  CloudOrganizationRelationshipInsert,
} from "@/types/cloud";

export async function fetchAllCloudMembers(): Promise<CloudMember[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapCloudMemberRow(row as never));
}

export async function fetchAllCloudOrganizationRelationships(): Promise<
  CloudOrganizationRelationship[]
> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("organization_relationships")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapCloudRelationshipRow(row as never));
}

export async function fetchCloudMemberByEmail(email: string): Promise<CloudMember | null> {
  const supabase = createSupabaseBrowserClient();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapCloudMemberRow(data as never) : null;
}

export async function fetchCloudMemberByMemberNumber(
  memberNumber: string,
): Promise<CloudMember | null> {
  const supabase = createSupabaseBrowserClient();
  const normalized = memberNumber.trim();
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("member_number", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapCloudMemberRow(data as never) : null;
}

export async function insertCloudMember(input: CloudMemberInsert): Promise<CloudMember> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("members")
    .insert({
      member_number: input.memberNumber.trim(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      current_level: input.currentLevel,
      sponsor_member_number: input.sponsorMemberNumber?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCloudMemberRow(data as never);
}

export async function insertCloudOrganizationRelationship(
  input: CloudOrganizationRelationshipInsert,
): Promise<CloudOrganizationRelationship> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("organization_relationships")
    .insert({
      parent_member_number: input.parentMemberNumber.trim(),
      child_member_number: input.childMemberNumber.trim(),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCloudRelationshipRow(data as never);
}

export async function fetchCloudOrganizationData(): Promise<{
  members: CloudMember[];
  relationships: CloudOrganizationRelationship[];
}> {
  const [members, relationships] = await Promise.all([
    fetchAllCloudMembers(),
    fetchAllCloudOrganizationRelationships(),
  ]);

  return { members, relationships };
}

export async function updateCloudMemberAvatar(
  memberId: string,
  avatarUrl: string | null,
): Promise<CloudMember> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("members")
    .update({ avatar_url: avatarUrl })
    .eq("id", memberId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapCloudMemberRow(data as never);
}
