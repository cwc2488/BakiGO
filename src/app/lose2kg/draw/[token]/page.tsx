import { Lose2kgPublicTempDrawPageView } from "@/components/lose2kg/Lose2kgPublicTempDrawPage";

export default async function Lose2kgPublicTempDrawRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Lose2kgPublicTempDrawPageView token={token} />;
}
