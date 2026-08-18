import { RecognitionAdminGuard } from "@/components/recognition/RecognitionAdminGuard";
import { decideRecognitionAdminAccess } from "@/lib/recognition/recognition-access";
import { isRecognitionAdmin } from "@/lib/recognition/recognition-service";
import { getMemberIdFromCookies } from "@/lib/supabase/member-auth-server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Server-side Recognition Admin gate.
 *
 * Direct URL access is denied here when the signed-in member can be resolved
 * from cookies. Unauthenticated visitors are still blocked by AuthGate
 * (`/recognition` is not a public path). The client guard remains as
 * defense-in-depth when cookies are unavailable.
 */
export default async function RecognitionAdminLayout({ children }: { children: ReactNode }) {
  if (isSupabaseServiceConfigured()) {
    const memberId = await getMemberIdFromCookies().catch(() => null);
    if (memberId) {
      const isAdmin = await isRecognitionAdmin(memberId).catch(() => false);
      const access = decideRecognitionAdminAccess({ memberId, isAdmin });
      if (access !== "allowed") {
        notFound();
      }
    }
  }

  return <RecognitionAdminGuard>{children}</RecognitionAdminGuard>;
}
