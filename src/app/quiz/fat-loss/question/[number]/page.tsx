import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FatLossQuizQuestionPage } from "@/components/quiz/FatLossQuizQuestionPage";
import { FAT_LOSS_QUESTIONS } from "@/lib/quiz/fat-loss/questions";
import { buildFatLossQuizPublicMetadata } from "@/lib/quiz/fat-loss/public-metadata";

export const metadata: Metadata = buildFatLossQuizPublicMetadata({
  title: "減脂卡關人格測驗｜進行中",
});

type PageProps = {
  params: Promise<{ number: string }>;
};

export default async function FatLossQuizQuestionRoute({ params }: PageProps) {
  const { number } = await params;
  const questionNumber = Number(number);
  if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > FAT_LOSS_QUESTIONS.length) {
    notFound();
  }
  return <FatLossQuizQuestionPage questionNumber={questionNumber} />;
}
