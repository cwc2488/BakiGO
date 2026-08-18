import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { normalizeMemberNumber } from "@/types/auth";

/**
 * Canonical BakiGO Super Admin identities.
 *
 * These are Herbalife 會員編號 (`members.member_number` /
 * `herbalifeMemberId`), not career rank and not a client-provided role.
 *
 * Recognition Center and the administration-center entry must use this
 * module. Do not copy the member number into components or API routes.
 */
export const SUPER_ADMIN_MEMBER_NUMBERS = ["20699471"] as const;

export type SuperAdminMemberNumber = (typeof SUPER_ADMIN_MEMBER_NUMBERS)[number];

export function isSuperAdmin(
  memberIdOrNumber: string | null | undefined,
): boolean {
  if (!memberIdOrNumber) return false;
  const normalized = normalizeMemberNumber(memberIdOrNumber);
  if (!normalized) return false;
  return SUPER_ADMIN_MEMBER_NUMBERS.some(
    (adminNumber) => normalizeMemberNumber(adminNumber) === normalized,
  );
}

/**
 * Server-side Super Admin check.
 *
 * `memberIdOrNumber` is usually `members.id` (UUID) from the authenticated
 * session. If it is already the Super Admin 會員編號, this returns true
 * without a database lookup. Otherwise the cloud `members.member_number`
 * is resolved and compared to {@link SUPER_ADMIN_MEMBER_NUMBERS}.
 */
export async function resolveIsSuperAdmin(
  memberIdOrNumber: string | null | undefined,
): Promise<boolean> {
  if (isSuperAdmin(memberIdOrNumber)) return true;
  if (!memberIdOrNumber) return false;
  const memberNumber = await lookupCloudMemberNumber(memberIdOrNumber);
  return isSuperAdmin(memberNumber);
}

async function lookupCloudMemberNumber(memberIdOrNumber: string): Promise<string | null> {
  if (!isSupabaseServiceConfigured()) return null;
  const supabase = createSupabaseServiceClient();

  const byId = await supabase
    .from("members")
    .select("member_number")
    .eq("id", memberIdOrNumber)
    .maybeSingle();
  if (byId.error) {
    throw new Error(byId.error.message);
  }
  if (byId.data?.member_number) {
    return String(byId.data.member_number);
  }

  const byNumber = await supabase
    .from("members")
    .select("member_number")
    .eq("member_number", memberIdOrNumber)
    .maybeSingle();
  if (byNumber.error) {
    throw new Error(byNumber.error.message);
  }
  return byNumber.data?.member_number ? String(byNumber.data.member_number) : null;
}
