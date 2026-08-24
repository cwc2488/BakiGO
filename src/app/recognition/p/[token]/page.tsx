import { RecognitionPublicCollectionPage } from "@/components/recognition/RecognitionPublicCollectionPage";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function RecognitionPublicCollectionRoute({ params }: PageProps) {
  const { token } = await params;
  return <RecognitionPublicCollectionPage token={token} />;
}
