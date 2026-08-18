import { RecognitionReviewPage } from "@/components/recognition/RecognitionReviewPage";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function RecognitionReviewRoute({ params }: PageProps) {
  const { eventId } = await params;
  return <RecognitionReviewPage eventId={eventId} />;
}
