import { RecognitionAdminGuard } from "@/components/recognition/RecognitionAdminGuard";
import { RecognitionReviewPage } from "@/components/recognition/RecognitionReviewPage";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function RecognitionReviewRoute({ params }: PageProps) {
  const { eventId } = await params;
  return (
    <RecognitionAdminGuard>
      <RecognitionReviewPage eventId={eventId} />
    </RecognitionAdminGuard>
  );
}
