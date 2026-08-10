import { QuizIntelligencePage } from "@/components/quiz/QuizIntelligencePage";

type PageProps = {
  params: Promise<{ resultId: string }>;
};

export default async function QuizIntelligenceRoute({ params }: PageProps) {
  const { resultId } = await params;
  return <QuizIntelligencePage resultId={resultId} />;
}
