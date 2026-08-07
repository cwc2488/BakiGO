import type { Member } from "@/types/member";

/** CRM「會員管理」後台 — 暫時隱藏，夥伴以組織圖查看夥伴即可。 */
export function canAccessMemberManagement(viewer: Member | null | undefined): boolean {
  return false;
}
