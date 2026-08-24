import { RecognitionExceptionCenterPage } from "@/components/recognition/RecognitionExceptionCenterPage";

export default async function Page({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <RecognitionExceptionCenterPage eventId={eventId} />;
}
