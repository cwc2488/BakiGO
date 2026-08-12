import PublicSharePage from "@/components/referral/PublicSharePage";

export default async function PublicShareRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicSharePage token={token} />;
}
