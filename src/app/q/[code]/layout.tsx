import type { Metadata } from "next";
import { buildFatLossQuizPublicMetadata } from "@/lib/quiz/fat-loss/public-metadata";

export const metadata: Metadata = buildFatLossQuizPublicMetadata();

export default function QuizShareLayout({ children }: LayoutProps<"/q/[code]">) {
  return children;
}
