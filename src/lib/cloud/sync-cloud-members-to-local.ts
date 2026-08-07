import { cloudMembersToLocalMembers } from "@/lib/cloud/cloud-member-mapper";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import {
  fetchMemberProfileExtensions,
  mergeMembersWithProfileExtensions,
} from "@/lib/members/member-profile-sync";
import { ensureVirtualUplineInMembers } from "@/lib/members/virtual-upline";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CloudMember } from "@/types/cloud";
import type { Member } from "@/types/member";

const CLOUD_MEMBERS_MODE = "1";

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

export function isCloudMembersMode(storage: StorageAdapter): boolean {
  return storage.getItem(STORAGE_KEYS.cloudMembersMode) === CLOUD_MEMBERS_MODE;
}

export async function replaceLocalMembersFromCloud(
  storage: StorageAdapter,
  cloudMembers: CloudMember[],
): Promise<Member[]> {
  const existingMembers = parseMembers(storage.getItem(STORAGE_KEYS.members));
  let localMembers = cloudMembersToLocalMembers(cloudMembers);
  const withVirtual = ensureVirtualUplineInMembers(localMembers);
  localMembers = withVirtual.members;

  const cloudExtensions = await fetchMemberProfileExtensions(
    localMembers.map((member) => member.id),
  );
  localMembers = mergeMembersWithProfileExtensions(
    localMembers,
    existingMembers,
    cloudExtensions,
  );

  storage.setItem(STORAGE_KEYS.cloudMembersMode, CLOUD_MEMBERS_MODE);
  storage.setItem(STORAGE_KEYS.members, JSON.stringify(localMembers));
  return localMembers;
}

/** Pull latest members from Supabase and mirror into local storage for existing engines/UI. */
export async function syncCloudMembersToLocalStorage(
  storage: StorageAdapter,
): Promise<Member[]> {
  const { members } = await fetchCloudOrganizationData();
  return replaceLocalMembersFromCloud(storage, members);
}

export function clearCloudMembersMode(storage: StorageAdapter): void {
  storage.removeItem(STORAGE_KEYS.cloudMembersMode);
}
