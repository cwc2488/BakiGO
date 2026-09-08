import { Lose2kgPublicTicketPageView } from "@/components/lose2kg/Lose2kgPublicTicketPage";

export default async function Lose2kgPublicTicketRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Lose2kgPublicTicketPageView token={token} />;
}
