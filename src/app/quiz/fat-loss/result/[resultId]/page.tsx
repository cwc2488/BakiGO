import type { Metadata } from "next";
import { FatLossQuizResultPage } from "@/components/quiz/FatLossQuizResultPage";

export const metadata: Metadata = {
  title: "測驗結果 | Baki GO",
};

type PageProps = {
  params: Promise<{ resultId: string }>;
};

export default async function FatLossQuizResultRoute({ params }: PageProps) {
  const { resultId } = await params;
  return <FatLossQuizResultPage resultId={resultId} />;
}
