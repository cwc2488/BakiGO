import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FatLossQuizQuestionPage } from "@/components/quiz/FatLossQuizQuestionPage";
import { FAT_LOSS_QUESTIONS } from "@/lib/quiz/fat-loss/questions";

export const metadata: Metadata = {
  title: "測驗進行中 | Baki GO",
};

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
