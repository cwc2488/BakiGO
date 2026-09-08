import { Lose2kgLiveDashboardPage } from "@/components/lose2kg/Lose2kgLiveDashboardPage";

export default async function Lose2kgLiveRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Lose2kgLiveDashboardPage token={token} />;
}
