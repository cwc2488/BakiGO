import { APP_IDS } from "@/lib/config/app-config";

/** Member numbers reserved for system accounts — cannot register or log in. */
export const RESERVED_CLOUD_MEMBER_NUMBERS = new Set<string>([
  APP_IDS.virtualUplineHerbalifeMemberId,
]);

export function isReservedCloudMemberNumber(memberNumber: string): boolean {
  return RESERVED_CLOUD_MEMBER_NUMBERS.has(memberNumber.trim());
}
