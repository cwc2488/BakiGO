import { ConsultationBriefPage } from "@/components/consultation/ConsultationBriefPage";

export default async function ConsultationBriefRoute({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ConsultationBriefPage sessionId={sessionId} />;
}
