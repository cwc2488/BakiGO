import { redirect } from "next/navigation";
import CoachingCustomerPortalPage from "@/components/coaching/CoachingCustomerPortalPage";
import { resolveCoachingPortalContext } from "@/lib/coaching/coaching-service";
import { isExperience21dEnrollment } from "@/lib/coaching/experience-21d";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";

/**
 * Legacy daily-form portal. Go21 enrollments are redirected to /go21.
 * Non-Go21 enrollments keep the form for rollback / historical customers —
 * but coaches can no longer start new generic coaching from normal UI.
 */
export default async function CustomerCoachingPortalRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (isSupabaseServiceConfigured()) {
    try {
      const context = await resolveCoachingPortalContext(token);
      if (
        context?.validToken &&
        context.planSnapshot &&
        isExperience21dEnrollment({ planSnapshot: context.planSnapshot })
      ) {
        redirect(`/c/${encodeURIComponent(token)}/go21`);
      }
    } catch {
      // Fall through to legacy portal (invalid token handled there).
    }
  }

  return <CoachingCustomerPortalPage token={token} />;
}
