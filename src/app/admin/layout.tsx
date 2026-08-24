import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { decideAdminAccess } from "@/lib/auth/admin-access";
import { resolveIsSuperAdmin } from "@/lib/auth/super-admin";
import { getMemberIdFromCookies } from "@/lib/supabase/member-auth-server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Server-side Admin Center gate.
 *
 * Direct URL access is denied when the signed-in member can be resolved
 * from cookies. Unauthenticated visitors are blocked by AuthGate.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (isSupabaseServiceConfigured()) {
    const memberId = await getMemberIdFromCookies().catch(() => null);
    if (memberId) {
      const isAdmin = await resolveIsSuperAdmin(memberId).catch(() => false);
      const access = decideAdminAccess({ memberId, isAdmin });
      if (access !== "allowed") {
        notFound();
      }
    }
  }

  return <SuperAdminGuard>{children}</SuperAdminGuard>;
}
