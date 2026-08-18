import { APP_IDS } from "@/lib/config/app-config";

/** Member numbers reserved for system accounts — cannot register or log in. */
export function getReservedCloudMemberNumbers(): Set<string> {
  return new Set<string>([APP_IDS.virtualUplineHerbalifeMemberId]);
}

export function isReservedCloudMemberNumber(memberNumber: string): boolean {
  return getReservedCloudMemberNumbers().has(memberNumber.trim());
}
