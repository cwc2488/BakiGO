import { Experience21dLandingPage } from "@/components/experience/Experience21dLandingPage";

export default async function Experience21dTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Experience21dLandingPage token={token} />;
}
