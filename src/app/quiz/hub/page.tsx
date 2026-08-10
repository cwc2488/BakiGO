import type { Metadata } from "next";
import { QuizHubPage } from "@/components/quiz/QuizHubPage";

export const metadata: Metadata = {
  title: "測驗中心 | Baki GO",
};

export default function QuizHubRoute() {
  return <QuizHubPage />;
}
