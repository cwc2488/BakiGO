import type { Metadata } from "next";
import { FatLossQuizNextStepPage } from "@/components/quiz/FatLossQuizNextStepPage";
import { buildFatLossQuizPublicMetadata } from "@/lib/quiz/fat-loss/public-metadata";

export const metadata: Metadata = buildFatLossQuizPublicMetadata({
  title: "個人化建議｜減脂卡關人格測驗",
});

type PageProps = {
  params: Promise<{ resultId: string }>;
};

export default async function FatLossQuizNextStepRoute({ params }: PageProps) {
  const { resultId } = await params;
  return <FatLossQuizNextStepPage resultId={resultId} />;
}
