import { RecognitionAdminGuard } from "@/components/recognition/RecognitionAdminGuard";
import { RecognitionCenterPage } from "@/components/recognition/RecognitionCenterPage";

export default function RecognitionRoute() {
  return (
    <RecognitionAdminGuard>
      <RecognitionCenterPage />
    </RecognitionAdminGuard>
  );
}
