import { Experience21dStartPage } from "@/components/quiz/Experience21dStartPage";
import { getMemberIdFromCookies } from "@/lib/supabase/member-auth-server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";

export default async function CustomerStart21dRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let initialCustomerName: string | null = null;

  if (isSupabaseServiceConfigured()) {
    try {
      const memberId = await getMemberIdFromCookies();
      if (memberId) {
        const supabase = createSupabaseServiceClient();
        const { data } = await supabase
          .from("customers")
          .select("display_name")
          .eq("id", id)
          .eq("owner_member_id", memberId)
          .maybeSingle();
        if (data?.display_name) {
          initialCustomerName = String(data.display_name).trim() || null;
        }
      }
    } catch {
      // Client load will recover name; never block the activation page.
    }
  }

  return (
    <Experience21dStartPage
      initialCustomerName={initialCustomerName}
      mode={{ kind: "customer", customerId: id }}
    />
  );
}
