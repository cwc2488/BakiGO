import { RecognitionAdminGuard } from "@/components/recognition/RecognitionAdminGuard";
import { RecognitionPhotoReviewPage } from "@/components/recognition/RecognitionPhotoReviewPage";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function RecognitionPhotoReviewRoute({ params }: PageProps) {
  const { eventId } = await params;
  return (
    <RecognitionAdminGuard>
      <RecognitionPhotoReviewPage eventId={eventId} />
    </RecognitionAdminGuard>
  );
}
