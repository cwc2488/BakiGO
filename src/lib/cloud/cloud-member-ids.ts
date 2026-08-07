/** Supabase members.id — standard UUID only (excludes local-only ids). */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Local-only member ids that must never be sent to Supabase UUID columns. */
const LOCAL_ONLY_MEMBER_IDS = new Set<string>([
  "member-virtual-upline",
  "member-default",
]);

export function isCloudDatabaseMemberId(memberId: string | null | undefined): boolean {
  if (!memberId || LOCAL_ONLY_MEMBER_IDS.has(memberId)) {
    return false;
  }
  return UUID_PATTERN.test(memberId);
}

export function filterCloudDatabaseMemberIds(memberIds: string[]): string[] {
  return memberIds.filter(isCloudDatabaseMemberId);
}
