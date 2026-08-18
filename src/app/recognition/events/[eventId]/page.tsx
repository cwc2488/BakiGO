import { RecognitionAdminGuard } from "@/components/recognition/RecognitionAdminGuard";
import { RecognitionEventPage } from "@/components/recognition/RecognitionEventPage";

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function RecognitionEventRoute({ params }: PageProps) {
  const { eventId } = await params;
  return (
    <RecognitionAdminGuard>
      <RecognitionEventPage eventId={eventId} />
    </RecognitionAdminGuard>
  );
}
