import type { Metadata } from "next";
import { FatLossQuizResultPage } from "@/components/quiz/FatLossQuizResultPage";
import { buildFatLossQuizPublicMetadata } from "@/lib/quiz/fat-loss/public-metadata";

export const metadata: Metadata = buildFatLossQuizPublicMetadata({
  title: "你的減脂卡關人格｜測驗結果",
});

type PageProps = {
  params: Promise<{ resultId: string }>;
};

export default async function FatLossQuizResultRoute({ params }: PageProps) {
  const { resultId } = await params;
  return <FatLossQuizResultPage resultId={resultId} />;
}
