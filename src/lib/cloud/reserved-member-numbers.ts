/**
 * Member numbers reserved for system accounts — cannot register or log in.
 * Literal kept here (not imported from app-config) to avoid app-config ↔ auth
 * circular initialization when reserved-member-numbers is loaded mid-cycle.
 * Must stay equal to APP_IDS.virtualUplineHerbalifeMemberId ("00000").
 */
export const RESERVED_CLOUD_MEMBER_NUMBERS = new Set<string>(["00000"]);

export function isReservedCloudMemberNumber(memberNumber: string): boolean {
  return RESERVED_CLOUD_MEMBER_NUMBERS.has(memberNumber.trim());
}
