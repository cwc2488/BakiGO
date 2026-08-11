import CoachingCustomerPortalPage from "@/components/coaching/CoachingCustomerPortalPage";

export default async function CustomerCoachingPortalRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CoachingCustomerPortalPage token={token} />;
}
