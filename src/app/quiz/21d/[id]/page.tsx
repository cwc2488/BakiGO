import { Quiz21dInterestDetailPage } from "@/components/quiz/Quiz21dInterestDetailPage";

export default async function Quiz21dDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Quiz21dInterestDetailPage interestId={id} />;
}
