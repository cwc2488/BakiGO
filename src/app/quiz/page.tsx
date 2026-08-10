import { redirect } from "next/navigation";
import { buildFatLossQuizPublicMetadata } from "@/lib/quiz/fat-loss/public-metadata";

export const metadata = buildFatLossQuizPublicMetadata();

export default function QuizIndexPage() {
  redirect("/quiz/fat-loss");
}
