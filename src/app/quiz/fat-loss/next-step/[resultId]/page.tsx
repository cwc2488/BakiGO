import type { Metadata } from "next";
import { FatLossQuizNextStepPage } from "@/components/quiz/FatLossQuizNextStepPage";

export const metadata: Metadata = {
  title: "你的下一步 | Baki GO",
};

type PageProps = {
  params: Promise<{ resultId: string }>;
};

export default async function FatLossQuizNextStepRoute({ params }: PageProps) {
  const { resultId } = await params;
  return <FatLossQuizNextStepPage resultId={resultId} />;
}
