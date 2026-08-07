import CustomerPortalPage from "@/components/customers/CustomerPortalPage";

export default async function CustomerPortalRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CustomerPortalPage token={token} />;
}
