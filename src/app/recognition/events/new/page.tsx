import { RecognitionAdminGuard } from "@/components/recognition/RecognitionAdminGuard";
import { RecognitionCreateEventPage } from "@/components/recognition/RecognitionCreateEventPage";

export default function RecognitionCreateEventRoute() {
  return (
    <RecognitionAdminGuard>
      <RecognitionCreateEventPage />
    </RecognitionAdminGuard>
  );
}
