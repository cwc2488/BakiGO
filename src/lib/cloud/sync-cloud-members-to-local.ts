import { cloudMembersToLocalMembers } from "@/lib/cloud/cloud-member-mapper";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { ensureVirtualUplineInMembers } from "@/lib/members/virtual-upline";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { CloudMember } from "@/types/cloud";
import type { Member } from "@/types/member";

const CLOUD_MEMBERS_MODE = "1";

export function isCloudMembersMode(storage: StorageAdapter): boolean {
  return storage.getItem(STORAGE_KEYS.cloudMembersMode) === CLOUD_MEMBERS_MODE;
}

export function replaceLocalMembersFromCloud(
  storage: StorageAdapter,
  cloudMembers: CloudMember[],
): Member[] {
  let localMembers = cloudMembersToLocalMembers(cloudMembers);
  const withVirtual = ensureVirtualUplineInMembers(localMembers);
  localMembers = withVirtual.members;
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
